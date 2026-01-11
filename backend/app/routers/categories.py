from fastapi import APIRouter
from .. import database
from ..categories import CATEGORIES, get_category_info

router = APIRouter(prefix="/api", tags=["categories"])


@router.get("/categories")
async def list_categories():
    """Get all categories with SNP counts."""
    categories = get_category_info()

    # Get counts for each category
    for cat in categories:
        results, count = await database.search_snps(category=cat["id"], limit=1)
        cat["count"] = count

    return categories


@router.get("/chromosomes")
async def get_chromosomes():
    """Get chromosome overview with SNP counts."""
    counts = await database.get_chromosome_counts()

    # Order chromosomes properly
    ordered = []
    for i in range(1, 23):
        chr_name = str(i)
        if chr_name in counts:
            ordered.append({"chromosome": chr_name, "count": counts[chr_name]})

    for special in ["X", "Y", "MT"]:
        if special in counts:
            ordered.append({"chromosome": special, "count": counts[special]})

    return ordered


@router.get("/dashboard")
async def get_dashboard():
    """Get dashboard data with most interesting variants based on activity."""
    # Get SNPs ranked by interest score
    interesting_snps = await database.get_most_interesting_snps(limit=20)

    # Also get traditional notable variants (high magnitude) for comparison
    notable = await database.get_notable_variants(limit=10)

    total_snps = await database.get_snp_count()
    annotated_snps = await database.get_annotation_count()

    # Get activity stats
    activity_stats = await database.get_activity_stats()

    # Get category counts
    category_counts = {}
    for cat_id in CATEGORIES.keys():
        results, count = await database.search_snps(category=cat_id, limit=1)
        category_counts[cat_id] = count

    return {
        "interesting_snps": interesting_snps,
        "notable_variants": notable,
        "category_counts": category_counts,
        "total_snps": total_snps,
        "annotated_snps": annotated_snps,
        "activity_stats": activity_stats
    }
