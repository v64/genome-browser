"""
API endpoints for the learning agent.

Controls the background agent that auto-enriches genome data,
provides access to the agent console/logs, and handles queries.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from .. import learning_agent
from .. import database
from .. import gene_discovery

router = APIRouter(prefix="/api/agent", tags=["agent"])


class QueryRequest(BaseModel):
    query: str


class QueryResponse(BaseModel):
    query: str
    claude_response: str
    snps_found: list[dict]
    interpretations: list[dict]
    pending_improvements: list[str] = []
    genotypes_requested: list[str] = []


@router.get("/status")
async def get_status():
    """Get the current status of the learning agent."""
    return learning_agent.get_agent_status()


@router.post("/start")
async def start_agent():
    """Start the learning agent background process."""
    return learning_agent.start_agent()


@router.post("/stop")
async def stop_agent():
    """Stop the learning agent background process."""
    return learning_agent.stop_agent()


@router.get("/logs")
async def get_logs(limit: int = 50):
    """Get recent agent logs."""
    logs = learning_agent.get_all_logs()
    return {"logs": logs[-limit:]}


@router.delete("/logs")
async def clear_logs():
    """Clear the agent logs."""
    learning_agent.clear_logs()
    return {"status": "cleared"}


@router.post("/query", response_model=QueryResponse)
async def process_query(request: QueryRequest):
    """
    Process a natural language query through the learning agent.

    This will:
    1. Ask Claude your question
    2. Extract any SNP rsIDs mentioned
    3. Look up your genotypes for those SNPs
    4. Get personalized interpretations
    5. Save everything to the knowledge base
    """
    try:
        result = await learning_agent.process_generic_query(request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/enrich")
async def trigger_enrichment(batch_size: int = 5):
    """Manually trigger enrichment of unannotated SNPs."""
    if not learning_agent.agent_state["running"]:
        # Run one batch even if agent isn't running
        await learning_agent.enrich_unannotated_snps(batch_size)
        return {"status": "completed", "batch_size": batch_size}
    else:
        return {"status": "agent_running", "message": "Agent is already enriching in background"}


@router.get("/history")
async def get_conversation_history(limit: int = 100):
    """Get all persisted Claude conversations from the database."""
    history = await database.get_chat_history(limit)
    return {"history": history, "count": len(history)}


@router.get("/knowledge")
async def get_knowledge_entries(search: str = None, limit: int = 50):
    """Get knowledge base entries (all Claude-generated content)."""
    entries = await database.search_knowledge(search=search, limit=limit)
    return {"entries": entries, "count": len(entries)}


@router.get("/stats")
async def get_full_stats():
    """Get comprehensive stats including database counts."""
    snp_count = await database.get_snp_count()
    annotation_count = await database.get_annotation_count()
    cache_stats = await database.get_snpedia_cache_stats()
    data_log_stats = await database.get_data_log_stats()

    return {
        "agent": learning_agent.agent_state["stats"],
        "database": {
            "snps": snp_count,
            "annotations": annotation_count,
            "snpedia_cache": cache_stats
        },
        "data_log": data_log_stats
    }


@router.get("/data-log")
async def get_data_log(
    source: str = None,
    data_type: str = None,
    reference_id: str = None,
    limit: int = 100
):
    """
    Get all logged data with optional filters.

    Sources: 'snpedia', 'claude', 'user'
    Data types: 'main_page', 'genotype_page', 'conversation', 'interpretation'
    """
    entries = await database.get_data_log(
        source=source,
        data_type=data_type,
        reference_id=reference_id,
        limit=limit
    )
    return {"entries": entries, "count": len(entries)}


@router.get("/suggestions")
async def get_query_suggestions():
    """
    Get personalized query suggestions based on recent activity.
    Uses Claude to generate thoughtful suggestions based on:
    - Recent queries
    - Interesting SNPs in the user's genome
    - Categories that have been explored
    """
    try:
        suggestions = await learning_agent.generate_query_suggestions()
        return {"suggestions": suggestions}
    except Exception as e:
        # Return fallback suggestions on error
        return {
            "suggestions": [
                "What are my most significant genetic variants?",
                "Do I have any risk variants for common diseases?",
                "What genes affect my metabolism?",
                "Tell me about my ancestry-related SNPs"
            ],
            "error": str(e)
        }


# Gene Discovery Worker Endpoints

@router.get("/discovery/status")
async def get_discovery_status():
    """Get current state of the gene discovery worker."""
    return gene_discovery.get_status()


@router.post("/discovery/start")
async def start_discovery():
    """Manually start the discovery worker if not running."""
    import asyncio
    if gene_discovery.discovery_state["is_running"]:
        return {"status": "already_running"}

    # Start in background
    asyncio.create_task(gene_discovery.start_discovery_worker())
    return {"status": "starting"}


@router.post("/discovery/stop")
async def stop_discovery():
    """Stop the discovery worker."""
    gene_discovery.stop_worker()
    return {"status": "stopping"}


@router.get("/discovery/logs")
async def get_discovery_logs(limit: int = 100):
    """Get recent discovery worker logs."""
    return {"logs": gene_discovery.get_logs(limit)}


@router.post("/discovery/clear-explored")
async def clear_explored_genes():
    """Clear the explored genes set to allow re-exploration of all genes."""
    gene_discovery.clear_explored()
    return {"status": "cleared"}


@router.get("/discovery/processing")
async def get_processing_status():
    """Get current processing status for UI (spinner/animation support)."""
    return gene_discovery.get_processing_status()


@router.post("/discovery/clear-completed")
async def clear_recently_completed(rsid: str = None):
    """Clear a specific rsid from recently completed list, or all if not specified."""
    gene_discovery.clear_recently_completed(rsid)
    return {"status": "cleared", "rsid": rsid}
