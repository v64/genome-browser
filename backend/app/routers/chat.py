from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from .. import database, claude_service, rag

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    message: str
    save_to_knowledge: bool = True


class ChatResponse(BaseModel):
    response: str
    snps_mentioned: list[str]
    snp_genotypes: dict[str, str] = {}
    usage: dict
    knowledge_id: Optional[int] = None


@router.post("", response_model=ChatResponse)
async def send_message(chat: ChatMessage):
    """Send a message to Claude and get a response."""
    if not claude_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Claude API is not configured. Set ANTHROPIC_API_KEY environment variable."
        )

    # Get conversation history
    history = await database.get_chat_history(limit=10)

    # Get RAG context
    rag_context = await rag.get_rag_context(chat.message)

    # Save user message
    await database.save_chat_message("user", chat.message)

    try:
        # Get response from Claude
        result = await claude_service.chat(
            message=chat.message,
            conversation_history=history,
            rag_context=rag_context
        )

        # Save assistant response
        await database.save_chat_message(
            "assistant",
            result["response"],
            result["snps_mentioned"]
        )

        # Get user's genotypes for mentioned SNPs
        snp_genotypes = {}
        if result["snps_mentioned"]:
            user_snps = await database.get_snps_by_rsids(result["snps_mentioned"])
            snp_genotypes = {snp["rsid"]: snp["genotype"] for snp in user_snps}

        # Optionally save to knowledge base
        knowledge_id = None
        if chat.save_to_knowledge and result["snps_mentioned"]:
            # Auto-categorize based on keywords
            category = auto_categorize(chat.message + " " + result["response"])
            knowledge_id = await rag.save_with_embedding(
                query=chat.message,
                response=result["response"],
                snps_mentioned=result["snps_mentioned"],
                category=category
            )

        return ChatResponse(
            response=result["response"],
            snps_mentioned=result["snps_mentioned"],
            snp_genotypes=snp_genotypes,
            usage=result["usage"],
            knowledge_id=knowledge_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_history(limit: int = 50):
    """Get chat history."""
    history = await database.get_chat_history(limit=limit)
    return {"messages": history}


@router.delete("/history")
async def clear_history():
    """Clear chat history."""
    await database.clear_chat_history()
    return {"status": "success", "message": "Chat history cleared"}


@router.get("/status")
async def get_status():
    """Check if Claude API is configured."""
    return {
        "configured": claude_service.is_configured(),
        "message": "Ready" if claude_service.is_configured() else "ANTHROPIC_API_KEY not set"
    }


@router.post("/explain/{rsid}")
async def explain_snp(rsid: str):
    """Get Claude's explanation for a specific SNP."""
    if not claude_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Claude API is not configured"
        )

    # Look up user's genotype
    snp = await database.get_snp(rsid)
    if not snp:
        raise HTTPException(status_code=404, detail=f"SNP {rsid} not found in your genome")

    try:
        result = await claude_service.explain_snp(rsid, snp["genotype"])

        # Save to chat history
        query = f"Explain {rsid} with genotype {snp['genotype']}"
        await database.save_chat_message("user", query)
        await database.save_chat_message("assistant", result["response"], result["snps_mentioned"])

        # Save to knowledge
        knowledge_id = await rag.save_with_embedding(
            query=query,
            response=result["response"],
            snps_mentioned=result["snps_mentioned"],
            category=auto_categorize(result["response"])
        )

        return {
            "rsid": rsid,
            "genotype": snp["genotype"],
            "explanation": result["response"],
            "snps_mentioned": result["snps_mentioned"],
            "usage": result["usage"],
            "knowledge_id": knowledge_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def auto_categorize(text: str) -> Optional[str]:
    """Auto-categorize based on keywords in text."""
    text_lower = text.lower()

    health_keywords = ["disease", "risk", "cancer", "diabetes", "heart", "alzheimer",
                       "medical", "health", "drug", "medication", "treatment"]
    trait_keywords = ["eye color", "hair", "height", "skin", "taste", "smell",
                      "lactose", "caffeine", "alcohol", "muscle"]
    intelligence_keywords = ["intelligence", "cognitive", "memory", "learning",
                             "brain", "iq", "educational", "mental"]
    ancestry_keywords = ["ancestry", "population", "european", "african", "asian",
                         "haplogroup", "ethnic"]

    if any(kw in text_lower for kw in health_keywords):
        return "health"
    if any(kw in text_lower for kw in trait_keywords):
        return "traits"
    if any(kw in text_lower for kw in intelligence_keywords):
        return "intelligence"
    if any(kw in text_lower for kw in ancestry_keywords):
        return "ancestry"

    return None
