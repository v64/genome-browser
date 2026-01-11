from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from pydantic import BaseModel
from .. import database

router = APIRouter(prefix="/api/labels", tags=["labels"])


class LabelRequest(BaseModel):
    label: str
    confidence: Optional[str] = None
    population_frequency: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
async def get_all_labels():
    """Get all unique genotype labels with counts."""
    labels = await database.get_all_labels()
    return {"labels": labels}


@router.get("/snps")
async def search_by_label(
    label: str = Query(..., description="Label to search for (normal, abnormal, rare, etc.)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """Get all SNPs with a specific genotype label."""
    results, total = await database.search_snps_by_label(label, limit, offset)
    return {
        "results": results,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(results) < total
    }


@router.get("/{rsid}")
async def get_label(rsid: str):
    """Get the genotype label for a specific SNP."""
    label = await database.get_genotype_label(rsid)
    if not label:
        return {"rsid": rsid, "label": None}
    return label


@router.put("/{rsid}")
async def set_label(rsid: str, request: LabelRequest):
    """Set or update the genotype label for an SNP."""
    # Verify the SNP exists
    snp = await database.get_snp(rsid)
    if not snp:
        raise HTTPException(status_code=404, detail=f"SNP {rsid} not found")

    await database.set_genotype_label(
        rsid=rsid,
        label=request.label,
        confidence=request.confidence,
        population_frequency=request.population_frequency,
        notes=request.notes,
        source="user"
    )

    # Log the label change
    await database.log_data(
        source="user",
        data_type="genotype_label",
        content=request.label,
        reference_id=rsid,
        metadata={
            "confidence": request.confidence,
            "population_frequency": request.population_frequency,
            "notes": request.notes
        }
    )

    return {"status": "success", "rsid": rsid, "label": request.label}


@router.delete("/{rsid}")
async def delete_label(rsid: str):
    """Delete a genotype label."""
    deleted = await database.delete_genotype_label(rsid)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No label found for {rsid}")
    return {"status": "success", "rsid": rsid}


@router.post("/batch")
async def get_labels_batch(rsids: list[str]):
    """Get genotype labels for multiple SNPs at once."""
    labels = await database.get_genotype_labels_batch(rsids)
    return {"labels": labels}
