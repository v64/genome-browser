from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from .. import database, rag

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class KnowledgeUpdate(BaseModel):
    response: Optional[str] = None
    category: Optional[str] = None
    snps_mentioned: Optional[list[str]] = None


class KnowledgeCreate(BaseModel):
    query: str
    response: str
    snps_mentioned: list[str] = []
    category: Optional[str] = None


@router.get("")
async def list_knowledge(
    search: Optional[str] = Query(None, description="Search in query and response"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(20, ge=1, le=100)
):
    """List knowledge entries with optional filtering."""
    entries = await database.search_knowledge(
        search=search,
        category=category,
        limit=limit
    )
    return {"entries": entries, "count": len(entries)}


@router.get("/categories")
async def get_categories():
    """Get available categories with counts."""
    all_entries = await database.search_knowledge(limit=1000)

    category_counts = {}
    for entry in all_entries:
        cat = entry.get("category") or "uncategorized"
        category_counts[cat] = category_counts.get(cat, 0) + 1

    return {"categories": category_counts}


@router.get("/similar")
async def find_similar(
    query: str = Query(..., description="Query to find similar knowledge for"),
    limit: int = Query(5, ge=1, le=20)
):
    """Find knowledge entries similar to a query (RAG search)."""
    similar = await rag.find_similar_knowledge(query, top_k=limit)
    return {"results": similar, "count": len(similar)}


@router.get("/{knowledge_id}")
async def get_knowledge(knowledge_id: int):
    """Get a single knowledge entry."""
    entry = await database.get_knowledge(knowledge_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")
    return entry


@router.post("")
async def create_knowledge(knowledge: KnowledgeCreate):
    """Create a new knowledge entry manually."""
    knowledge_id = await rag.save_with_embedding(
        query=knowledge.query,
        response=knowledge.response,
        snps_mentioned=knowledge.snps_mentioned,
        category=knowledge.category
    )
    return {"id": knowledge_id, "status": "created"}


@router.put("/{knowledge_id}")
async def update_knowledge(knowledge_id: int, update: KnowledgeUpdate):
    """Update a knowledge entry."""
    # Check if exists
    existing = await database.get_knowledge(knowledge_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")

    await database.update_knowledge(
        knowledge_id=knowledge_id,
        response=update.response,
        category=update.category,
        snps_mentioned=update.snps_mentioned
    )

    return {"id": knowledge_id, "status": "updated"}


@router.delete("/{knowledge_id}")
async def delete_knowledge(knowledge_id: int):
    """Delete a knowledge entry."""
    existing = await database.get_knowledge(knowledge_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")

    await database.delete_knowledge(knowledge_id)
    return {"id": knowledge_id, "status": "deleted"}


@router.post("/import")
async def import_knowledge(entries: list[KnowledgeCreate]):
    """Bulk import knowledge entries."""
    imported_ids = []
    for entry in entries:
        knowledge_id = await rag.save_with_embedding(
            query=entry.query,
            response=entry.response,
            snps_mentioned=entry.snps_mentioned,
            category=entry.category
        )
        imported_ids.append(knowledge_id)

    return {"imported": len(imported_ids), "ids": imported_ids}
