from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
from .. import database, claude_service

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


class ImproveRequest(BaseModel):
    apply: bool = True  # Whether to save the improvement to the database


class EditRequest(BaseModel):
    summary: Optional[str] = None
    genotype_info: Optional[dict] = None


class ImproveResponse(BaseModel):
    rsid: str
    improved_summary: Optional[str]
    improved_genotype_info: dict
    applied: bool = False
    usage: Optional[dict] = None


@router.post("/{rsid}/improve", response_model=ImproveResponse)
async def improve_annotation(rsid: str, request: ImproveRequest = None):
    """Ask Claude to improve/rewrite an annotation in clearer language."""
    if not claude_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Claude API is not configured"
        )

    # Get the SNP to get genotype
    snp = await database.get_snp(rsid)
    if not snp:
        raise HTTPException(status_code=404, detail=f"SNP {rsid} not found")

    # Check if annotation exists
    annotation = await database.get_annotation(rsid)
    if not annotation:
        raise HTTPException(
            status_code=404,
            detail=f"No annotation found for {rsid}. Sync from SNPedia first."
        )

    try:
        result = await claude_service.improve_annotation(rsid, snp["genotype"])

        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])

        applied = False
        if request and request.apply:
            # Save the improved annotation
            await database.improve_annotation(
                rsid=rsid,
                summary=result.get("improved_summary"),
                genotype_info=result.get("improved_genotype_info"),
                source="claude"
            )
            applied = True

            # Log this improvement to data log
            await database.log_data(
                source="claude",
                data_type="annotation_improvement",
                content=result.get("improved_summary", ""),
                reference_id=rsid,
                metadata={
                    "original_summary": annotation.get("summary"),
                    "improved_genotype_info": result.get("improved_genotype_info"),
                    "genotype": snp["genotype"],
                    "usage": result.get("usage")
                }
            )

            # Add to RAG knowledge base
            await database.save_knowledge(
                query=f"What is {rsid}? What does {snp['genotype']} mean for {rsid}?",
                response=result.get("improved_summary", ""),
                snps_mentioned=[rsid],
                source="claude_improvement"
            )

        return ImproveResponse(
            rsid=rsid,
            improved_summary=result.get("improved_summary"),
            improved_genotype_info=result.get("improved_genotype_info", {}),
            applied=applied,
            usage=result.get("usage")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{rsid}")
async def edit_annotation(rsid: str, edit: EditRequest):
    """Manually edit an annotation."""
    # Check if annotation exists
    annotation = await database.get_annotation(rsid)
    if not annotation:
        raise HTTPException(
            status_code=404,
            detail=f"No annotation found for {rsid}"
        )

    if edit.summary is None and edit.genotype_info is None:
        raise HTTPException(
            status_code=400,
            detail="Must provide summary or genotype_info to update"
        )

    try:
        await database.improve_annotation(
            rsid=rsid,
            summary=edit.summary,
            genotype_info=edit.genotype_info,
            source="user"
        )

        # Log this user edit to data log
        await database.log_data(
            source="user",
            data_type="annotation_edit",
            content=edit.summary or json.dumps(edit.genotype_info),
            reference_id=rsid,
            metadata={
                "original_summary": annotation.get("summary"),
                "edited_summary": edit.summary,
                "edited_genotype_info": edit.genotype_info
            }
        )

        # Add to RAG knowledge base
        if edit.summary:
            await database.save_knowledge(
                query=f"What is {rsid}?",
                response=edit.summary,
                snps_mentioned=[rsid],
                source="user_edit"
            )

        # Return updated annotation
        updated = await database.get_annotation(rsid)
        return {
            "status": "success",
            "rsid": rsid,
            "annotation": updated
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{rsid}/revert")
async def revert_annotation(rsid: str):
    """Revert an annotation to its original SNPedia version."""
    annotation = await database.get_annotation(rsid)
    if not annotation:
        raise HTTPException(
            status_code=404,
            detail=f"No annotation found for {rsid}"
        )

    if not annotation.get("original_summary") and not annotation.get("original_genotype_info"):
        raise HTTPException(
            status_code=400,
            detail="No original version to revert to"
        )

    try:
        await database.revert_annotation(rsid)

        updated = await database.get_annotation(rsid)
        return {
            "status": "success",
            "rsid": rsid,
            "annotation": updated
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{rsid}")
async def get_annotation(rsid: str):
    """Get annotation details including improvement status."""
    annotation = await database.get_annotation(rsid)
    if not annotation:
        raise HTTPException(
            status_code=404,
            detail=f"No annotation found for {rsid}"
        )

    return annotation


@router.post("/batch-improve")
async def batch_improve_annotations(
    category: Optional[str] = None,
    min_magnitude: Optional[float] = None,
    limit: int = 10
):
    """Batch improve multiple annotations."""
    if not claude_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Claude API is not configured"
        )

    # Get SNPs to improve
    snps = await database.query_snps_advanced(
        categories=[category] if category else None,
        min_magnitude=min_magnitude,
        has_annotation=True,
        limit=limit
    )

    # Filter to only those not already improved
    to_improve = [s for s in snps if s.get("annotation_source") == "snpedia"]

    if not to_improve:
        return {
            "status": "success",
            "message": "No annotations need improvement",
            "improved": 0
        }

    results = []
    for snp in to_improve:
        try:
            result = await claude_service.improve_annotation(snp["rsid"], snp["genotype"])

            if "error" not in result:
                await database.improve_annotation(
                    rsid=snp["rsid"],
                    summary=result.get("improved_summary"),
                    genotype_info=result.get("improved_genotype_info"),
                    source="claude"
                )

                # Log this improvement
                await database.log_data(
                    source="claude",
                    data_type="annotation_improvement",
                    content=result.get("improved_summary", ""),
                    reference_id=snp["rsid"],
                    metadata={
                        "batch": True,
                        "genotype": snp.get("genotype"),
                        "improved_genotype_info": result.get("improved_genotype_info")
                    }
                )

                # Add to RAG knowledge base
                await database.save_knowledge(
                    query=f"What is {snp['rsid']}? What does {snp.get('genotype')} mean?",
                    response=result.get("improved_summary", ""),
                    snps_mentioned=[snp["rsid"]],
                    source="claude_improvement"
                )

                results.append({
                    "rsid": snp["rsid"],
                    "status": "improved"
                })
            else:
                results.append({
                    "rsid": snp["rsid"],
                    "status": "error",
                    "error": result["error"]
                })

        except Exception as e:
            results.append({
                "rsid": snp["rsid"],
                "status": "error",
                "error": str(e)
            })

    return {
        "status": "success",
        "improved": len([r for r in results if r["status"] == "improved"]),
        "results": results
    }
