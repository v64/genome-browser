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
    tag: Optional[str] = Query(None, description="Filter by tag (exact match in categories)"),
    min_magnitude: Optional[float] = Query(None, ge=0, le=10, description="Minimum magnitude"),
    repute: Optional[str] = Query(None, description="Filter by repute: good, bad, neutral"),
    effective_repute: Optional[str] = Query(None, description="Filter by effective repute (user's genotype): good, bad"),
    label: Optional[str] = Query(None, description="Filter by genotype label: risk, normal, protective, carrier, neutral"),
    favorites_only: bool = Query(False, description="Show only favorites"),
    limit: int = Query(50, ge=1, le=200, description="Results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """Search and list SNPs with optional filters."""
    results, total = await database.search_snps(
        search=search,
        chromosome=chromosome,
        category=category,
        tag=tag,
        min_magnitude=min_magnitude,
        repute=repute,
        effective_repute_filter=effective_repute,
        label=label,
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


@router.get("/meta/tags")
async def get_all_tags():
    """Get all unique tags/categories with their counts."""
    tags = await database.get_all_tags()
    return {"tags": tags}


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

    # Get genotype label if available (Claude's classification)
    genotype_label_data = await database.get_genotype_label(rsid)
    genotype_label = genotype_label_data.get("label") if genotype_label_data else None

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

        # Calculate effective repute based on user's actual genotype (use Claude's label if available)
        effective_repute = snpedia.get_effective_repute(
            genotype_info,
            snp.get("genotype"),
            annotation.get("repute"),
            genotype_label
        )

        result.update({
            "summary": annotation.get("summary"),
            "magnitude": annotation.get("magnitude"),
            "repute": annotation.get("repute"),
            "effective_repute": effective_repute,
            "gene": annotation.get("gene"),
            "title": annotation.get("title"),
            "categories": annotation.get("categories", []),
            "genotype_info": genotype_info,
            "references": annotation.get("references", []),
            "your_interpretation": user_interpretation,
            "matched_genotype": matched_gt,  # Shows which genotype matched (for strand info)
            "source": annotation.get("source"),
            "original_summary": annotation.get("original_summary"),
            "analysis_model": annotation.get("analysis_model"),
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


@router.post("/{rsid}/improve")
async def improve_snp_annotation(
    rsid: str,
    quality: str = Query("standard", description="Quality level: quick (haiku), standard (sonnet), premium (opus)")
):
    """
    Request an improved annotation for a SNP using AI.

    Quality levels:
    - quick: Uses Haiku (fast, cheap) - good for bulk processing
    - standard: Uses Sonnet (balanced) - good detail and accuracy
    - premium: Uses Opus (best) - most comprehensive analysis
    """
    from .. import claude_service

    # Map quality to model
    model_map = {
        "quick": "claude-3-haiku-20240307",
        "standard": "claude-sonnet-4-5",
        "premium": "claude-opus-4-5",
    }

    model = model_map.get(quality, model_map["standard"])

    # Get SNP data
    snp = await database.get_snp(rsid)
    if not snp:
        raise HTTPException(status_code=404, detail=f"SNP {rsid} not found")

    genotype = snp.get("genotype")

    # Improve annotation
    result = await claude_service.improve_annotation(rsid, genotype, model=model)

    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    # Save the improved annotation
    new_label = None
    if result.get("improved_summary"):
        await database.improve_annotation(
            rsid=rsid,
            summary=result["improved_summary"],
            genotype_info=result.get("improved_genotype_info", {}),
            title=result.get("title"),
            categories=result.get("tags", []),
            analysis_model=model
        )

        # Also reclassify the genotype label based on new interpretation
        improved_genotype_info = result.get("improved_genotype_info", {})
        if improved_genotype_info and genotype:
            from .. import learning_agent
            interpretation, _ = snpedia.get_genotype_interpretation(improved_genotype_info, genotype)
            if interpretation:
                label_result = await learning_agent.classify_existing_interpretation(rsid, genotype, interpretation)
                if label_result:
                    new_label = label_result.get("label")

    return {
        "rsid": rsid,
        "quality": quality,
        "model": model,
        "title": result.get("title"),
        "summary": result.get("improved_summary"),
        "genotype_info": result.get("improved_genotype_info"),
        "tags": result.get("tags"),
        "usage": result.get("usage"),
        "label": new_label
    }
