from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from .. import database, claude_service

router = APIRouter(prefix="/api/search", tags=["search"])


class NaturalSearchRequest(BaseModel):
    query: str
    save_to_knowledge: bool = True


class SearchResult(BaseModel):
    rsid: str
    genotype: str
    chromosome: Optional[str]
    position: Optional[int]
    gene: Optional[str]
    summary: Optional[str]
    magnitude: Optional[float]
    repute: Optional[str]
    categories: list[str] = []
    relevance: Optional[str] = None
    interpretation: Optional[str] = None


class NaturalSearchResponse(BaseModel):
    query: str
    interpretation: str
    search_type: str
    results: list[dict]
    total: int
    usage: Optional[dict] = None


@router.post("/natural", response_model=NaturalSearchResponse)
async def natural_search(request: NaturalSearchRequest):
    """
    Natural language search of your genome.

    Examples:
    - "Show me SNPs related to alcohol metabolism"
    - "What are my high-risk variants?"
    - "Do I have any rare mutations?"
    - "SNPs affecting intelligence"
    - "What does my APOE status look like?"
    """
    if not claude_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Claude API is not configured. Natural language search requires Claude."
        )

    try:
        result = await claude_service.natural_language_search(request.query)

        if "error" in result and result.get("total", 0) == 0:
            raise HTTPException(status_code=500, detail=result["error"])

        # Optionally save to knowledge base for future reference
        if request.save_to_knowledge and result.get("results"):
            snps_found = [r["rsid"] for r in result["results"][:10]]
            await database.save_knowledge(
                query=request.query,
                response=f"Found {result['total']} SNPs: {result.get('interpretation', '')}",
                snps_mentioned=snps_found,
                category=None,
                source="search"
            )

        return NaturalSearchResponse(
            query=result["query"],
            interpretation=result.get("interpretation", ""),
            search_type=result.get("search_type", "general"),
            results=result.get("results", []),
            total=result.get("total", 0),
            usage=result.get("usage")
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions")
async def get_search_suggestions():
    """Get example search queries the user can try."""
    return {
        "suggestions": [
            {
                "category": "Health Risks",
                "queries": [
                    "What are my highest risk variants?",
                    "Show me SNPs related to heart disease",
                    "Do I have any cancer risk genes?",
                    "Alzheimer's risk factors in my genome"
                ]
            },
            {
                "category": "Traits",
                "queries": [
                    "What determines my eye color?",
                    "SNPs affecting caffeine metabolism",
                    "Am I likely lactose intolerant?",
                    "Genes related to muscle composition"
                ]
            },
            {
                "category": "Rare Variants",
                "queries": [
                    "Show me my rare variants",
                    "Unusual genotypes I have",
                    "High magnitude SNPs in my genome"
                ]
            },
            {
                "category": "Ancestry & Population",
                "queries": [
                    "What do my genes say about ancestry?",
                    "Population-specific variants I carry"
                ]
            },
            {
                "category": "Drug Response",
                "queries": [
                    "How do I metabolize medications?",
                    "Warfarin sensitivity genes",
                    "CYP450 variants I have"
                ]
            }
        ]
    }


@router.get("/quick/{category}")
async def quick_search(category: str, limit: int = 20):
    """Quick category-based search without Claude (faster, uses database directly)."""
    valid_categories = ["health", "traits", "intelligence", "ancestry"]

    if category == "high_risk":
        # Get high magnitude bad repute SNPs
        results = await database.query_snps_advanced(
            min_magnitude=3,
            repute="bad",
            has_annotation=True,
            limit=limit
        )
        interpretation = "SNPs with high importance (magnitude >= 3) and potentially negative effects"

    elif category == "notable":
        # Get any high magnitude SNPs
        results = await database.query_snps_advanced(
            min_magnitude=2.5,
            has_annotation=True,
            limit=limit
        )
        interpretation = "Notable SNPs with moderate to high importance"

    elif category in valid_categories:
        results = await database.query_snps_advanced(
            categories=[category],
            has_annotation=True,
            limit=limit
        )
        interpretation = f"SNPs in the {category} category"

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Valid options: {valid_categories + ['high_risk', 'notable']}"
        )

    return {
        "category": category,
        "interpretation": interpretation,
        "results": results,
        "total": len(results)
    }
