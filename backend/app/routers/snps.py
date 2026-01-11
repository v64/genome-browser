from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from .. import database, snpedia
from ..models import SNPWithAnnotation

router = APIRouter(prefix="/api/snps", tags=["snps"])


@router.get("")
async def list_snps(
    search: Optional[str] = Query(None, description="Search by rsid, gene, or keyword"),
    chromosome: Optional[str] = Query(None, description="Filter by chromosome"),
    category: Optional[str] = Query(None, description="Filter by category"),
    min_magnitude: Optional[float] = Query(None, ge=0, le=10, description="Minimum magnitude"),
    repute: Optional[str] = Query(None, description="Filter by repute: good, bad, neutral"),
    favorites_only: bool = Query(False, description="Show only favorites"),
    limit: int = Query(50, ge=1, le=200, description="Results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """Search and list SNPs with optional filters."""
    results, total = await database.search_snps(
        search=search,
        chromosome=chromosome,
        category=category,
        min_magnitude=min_magnitude,
        repute=repute,
        favorites_only=favorites_only,
        limit=limit,
        offset=offset
    )

    return {
        "results": results,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(results) < total
    }


@router.get("/{rsid}")
async def get_snp(rsid: str):
    """Get detailed information for a single SNP."""
    # Get base SNP data
    snp = await database.get_snp(rsid)
    if not snp:
        raise HTTPException(status_code=404, detail=f"SNP {rsid} not found in your genome")

    # Try to get/fetch annotation
    annotation = await database.get_annotation(rsid)

    # If no annotation cached, try to fetch from SNPedia
    if not annotation:
        annotation = await snpedia.fetch_snp_info(rsid)

    # Check if favorite
    favorites = await database.get_favorites()
    is_favorite = rsid in favorites

    result = {
        **snp,
        "is_favorite": is_favorite,
        "has_annotation": annotation is not None
    }

    if annotation:
        genotype_info = annotation.get("genotype_info", {})

        # Find interpretation for user's genotype (with strand awareness)
        user_interpretation, matched_gt = snpedia.get_genotype_interpretation(
            genotype_info, snp.get("genotype")
        )

        result.update({
            "summary": annotation.get("summary"),
            "magnitude": annotation.get("magnitude"),
            "repute": annotation.get("repute"),
            "gene": annotation.get("gene"),
            "categories": annotation.get("categories", []),
            "genotype_info": genotype_info,
            "references": annotation.get("references", []),
            "your_interpretation": user_interpretation,
            "matched_genotype": matched_gt  # Shows which genotype matched (for strand info)
        })

    return result


@router.get("/{rsid}/full")
async def get_snp_full_data(rsid: str):
    """Get ALL data we have on an SNP - annotations, conversations, knowledge, data log entries."""
    # Get base SNP data
    snp = await database.get_snp(rsid)
    if not snp:
        raise HTTPException(status_code=404, detail=f"SNP {rsid} not found in your genome")

    # Get annotation
    annotation = await database.get_annotation(rsid)
    if not annotation:
        annotation = await snpedia.fetch_snp_info(rsid)

    # Check if favorite
    favorites = await database.get_favorites()
    is_favorite = rsid in favorites

    # Get all data log entries for this SNP
    data_log_entries = await database.get_data_log(reference_id=rsid, limit=500)

    # Get knowledge base entries mentioning this SNP
    knowledge_entries = await database.get_knowledge_for_snp(rsid)

    # Get chat messages mentioning this SNP
    chat_messages = await database.get_chat_messages_for_snp(rsid)

    # Get cached SNPedia pages
    snpedia_cache = await database.get_cached_snpedia_page(rsid)

    # Get genotype-specific cached pages
    genotype_pages = []
    if snp.get("genotype"):
        rsid_formatted = rsid[0:2].capitalize() + rsid[2:]
        for gt in ["A;A", "A;C", "A;G", "A;T", "C;C", "C;G", "C;T", "G;G", "G;T", "T;T"]:
            page_name = f"{rsid_formatted}({gt})"
            cached = await database.get_cached_snpedia_page(page_name)
            if cached:
                genotype_pages.append({
                    "genotype": gt,
                    "page_name": page_name,
                    "wikitext": cached.get("wikitext", "")[:500] + "..." if len(cached.get("wikitext", "")) > 500 else cached.get("wikitext", "")
                })

    result = {
        **snp,
        "is_favorite": is_favorite,
        "has_annotation": annotation is not None,
        "annotation": annotation,
        "data_log_entries": data_log_entries,
        "knowledge_entries": knowledge_entries,
        "chat_messages": chat_messages,
        "snpedia_cache": {
            "main_page": snpedia_cache,
            "genotype_pages": genotype_pages
        }
    }

    if annotation:
        genotype_info = annotation.get("genotype_info", {})
        user_interpretation, matched_gt = snpedia.get_genotype_interpretation(
            genotype_info, snp.get("genotype")
        )
        result["your_interpretation"] = user_interpretation
        result["matched_genotype"] = matched_gt

    return result
