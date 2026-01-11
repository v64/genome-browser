from fastapi import APIRouter
from .. import database

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


@router.get("")
async def list_favorites():
    """Get all favorite SNPs with their data."""
    favorite_rsids = await database.get_favorites()

    if not favorite_rsids:
        return {"favorites": [], "count": 0}

    # Get full SNP data for favorites
    results, _ = await database.search_snps(favorites_only=True, limit=200)

    return {"favorites": results, "count": len(results)}


@router.post("/{rsid}")
async def add_favorite(rsid: str):
    """Add a SNP to favorites."""
    # Verify the SNP exists
    snp = await database.get_snp(rsid)
    if not snp:
        return {"status": "error", "message": f"SNP {rsid} not found in your genome"}

    await database.add_favorite(rsid)
    return {"status": "success", "message": f"Added {rsid} to favorites"}


@router.delete("/{rsid}")
async def remove_favorite(rsid: str):
    """Remove a SNP from favorites."""
    await database.remove_favorite(rsid)
    return {"status": "success", "message": f"Removed {rsid} from favorites"}
