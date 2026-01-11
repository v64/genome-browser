import asyncio
from fastapi import APIRouter, BackgroundTasks
from .. import database, snpedia
from ..categories import get_all_priority_snps

router = APIRouter(prefix="/api/sync", tags=["sync"])

# Global sync state
sync_state = {
    "is_syncing": False,
    "current_rsid": None,
    "fetched_count": 0,
    "total_to_fetch": 0
}


async def background_sync():
    """Background task to fetch annotations for priority SNPs."""
    global sync_state

    sync_state["is_syncing"] = True

    try:
        # Get priority SNPs that need fetching
        priority_snps = get_all_priority_snps()
        to_fetch = await database.get_unannotated_rsids(priority_snps)

        sync_state["total_to_fetch"] = len(to_fetch)
        sync_state["fetched_count"] = 0

        for rsid in to_fetch:
            sync_state["current_rsid"] = rsid
            await snpedia.fetch_snp_info(rsid)
            sync_state["fetched_count"] += 1

    finally:
        sync_state["is_syncing"] = False
        sync_state["current_rsid"] = None


@router.get("/status")
async def get_sync_status():
    """Get current sync status."""
    total_snps = await database.get_snp_count()
    annotated_snps = await database.get_annotation_count()

    return {
        "total_snps": total_snps,
        "annotated_snps": annotated_snps,
        "is_syncing": sync_state["is_syncing"],
        "current_rsid": sync_state["current_rsid"],
        "sync_progress": {
            "fetched": sync_state["fetched_count"],
            "total": sync_state["total_to_fetch"]
        }
    }


@router.post("/start")
async def start_sync(background_tasks: BackgroundTasks):
    """Start background annotation sync."""
    if sync_state["is_syncing"]:
        return {"message": "Sync already in progress", "status": "running"}

    background_tasks.add_task(background_sync)
    return {"message": "Sync started", "status": "started"}


@router.post("/fetch/{rsid}")
async def fetch_single(rsid: str):
    """Fetch annotation for a single SNP on-demand."""
    result = await snpedia.fetch_snp_info(rsid)
    if result:
        return {"status": "success", "annotation": result}
    return {"status": "not_found", "message": f"No SNPedia data found for {rsid}"}
