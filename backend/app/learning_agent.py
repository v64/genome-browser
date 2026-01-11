"""
Self-improving learning agent that automatically enriches genome data.

Runs in background, queries Claude about SNPs, extracts interpretations,
and saves everything to the knowledge base and annotations.
"""
import asyncio
import re
import json
from datetime import datetime
from typing import Optional, Callable
from anthropic import Anthropic

from . import database

# Global state for the learning agent
agent_state = {
    "running": False,
    "logs": [],  # List of {timestamp, type, message}
    "current_task": None,
    "stats": {
        "queries_processed": 0,
        "snps_enriched": 0,
        "knowledge_added": 0
    }
}

MAX_LOGS = 500  # Keep last 500 log entries in memory for UI


async def log_async(msg_type: str, message: str, data: dict = None):
    """Add a log entry and persist to database."""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "type": msg_type,  # "user", "claude", "system", "error"
        "message": message,
        "data": data
    }
    agent_state["logs"].append(entry)

    # Trim old logs from memory (but they're saved in DB)
    if len(agent_state["logs"]) > MAX_LOGS:
        agent_state["logs"] = agent_state["logs"][-MAX_LOGS:]

    # Persist Claude conversations to database (user prompts and claude responses)
    if msg_type in ("user", "claude"):
        role = "user" if msg_type == "user" else "assistant"
        rsids = extract_rsids(message) if msg_type == "claude" else []
        await database.save_chat_message(role, message, rsids)


def log(msg_type: str, message: str, data: dict = None):
    """Sync wrapper for logging - use log_async when in async context."""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "type": msg_type,
        "message": message,
        "data": data
    }
    agent_state["logs"].append(entry)
    if len(agent_state["logs"]) > MAX_LOGS:
        agent_state["logs"] = agent_state["logs"][-MAX_LOGS:]


def extract_rsids(text: str) -> list[str]:
    """Extract all rsID mentions from text."""
    # Match rs followed by digits, case insensitive
    matches = re.findall(r'\brs\d+\b', text, re.IGNORECASE)
    # Normalize to lowercase and dedupe
    return list(set(rsid.lower() for rsid in matches))


async def query_claude(prompt: str, system_context: str = None) -> str:
    """Send a query to Claude and return the response. All exchanges are persisted."""
    import os

    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    system = system_context or """You are a genetics research assistant. When discussing SNPs,
always mention specific rsIDs (like rs12345). Be concise but informative."""

    # Log and persist the prompt
    await log_async("user", prompt)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=system,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text
        rsids_found = extract_rsids(response_text)

        # Log and persist Claude's response
        await log_async("claude", response_text)

        # Log to unified data log
        await database.log_data(
            source="claude",
            data_type="conversation",
            content=response_text,
            reference_id=None,
            metadata={
                "prompt": prompt,
                "rsids_mentioned": rsids_found,
                "model": "claude-sonnet-4-20250514",
                "tokens_used": getattr(response.usage, 'output_tokens', None)
            }
        )

        # Also save the full exchange to knowledge base for RAG
        await database.save_knowledge(
            query=prompt,
            response=response_text,
            snps_mentioned=rsids_found,
            source="claude_conversation"
        )

        return response_text

    except Exception as e:
        await log_async("error", f"Claude API error: {str(e)}")
        raise


async def get_user_genotype(rsid: str) -> Optional[dict]:
    """Look up user's genotype for an rsID."""
    snp = await database.get_snp_by_rsid(rsid)
    if snp:
        return {
            "rsid": rsid,
            "genotype": snp.get("genotype"),
            "chromosome": snp.get("chromosome"),
            "position": snp.get("position")
        }
    return None


async def interpret_genotype(rsid: str, genotype: str, context: str = "") -> str:
    """Ask Claude to interpret a specific genotype."""
    # Check if we already have an interpretation
    existing = await database.get_annotation(rsid)
    if existing and existing.get("genotype_info", {}).get(genotype):
        log("system", f"Using cached interpretation for {rsid} {genotype}")
        return existing["genotype_info"][genotype]

    prompt = f"""For the SNP {rsid}, what does having the {genotype} genotype mean?
{f'Context: {context}' if context else ''}

Be specific about health implications, traits, or other effects.
If this is a common/normal genotype, say so.
Keep response to 2-3 sentences."""

    interpretation = await query_claude(prompt)

    # Save to annotations
    await save_genotype_interpretation(rsid, genotype, interpretation)

    return interpretation


async def save_genotype_interpretation(rsid: str, genotype: str, interpretation: str):
    """Save a genotype interpretation to the database."""
    existing = await database.get_annotation(rsid) or {}

    genotype_info = existing.get("genotype_info", {})
    genotype_key = genotype.replace(";", "").upper()
    genotype_info[genotype_key] = interpretation

    existing["genotype_info"] = genotype_info
    existing["source"] = existing.get("source", "claude")

    await database.save_annotation(rsid, existing)
    agent_state["stats"]["snps_enriched"] += 1

    # Log this interpretation to unified data log
    await database.log_data(
        source="claude",
        data_type="interpretation",
        content=interpretation,
        reference_id=rsid,
        metadata={"genotype": genotype_key, "rsid": rsid}
    )

    # Also save to knowledge base
    await database.save_knowledge(
        query=f"What does {genotype} mean for {rsid}?",
        response=interpretation,
        snps_mentioned=[rsid],
        category=existing.get("categories", ["health"])[0] if existing.get("categories") else None,
        source="claude"
    )
    agent_state["stats"]["knowledge_added"] += 1


async def process_generic_query(query: str) -> dict:
    """
    Process a generic query like "what genes are related to alcohol".

    Flow:
    1. Ask Claude the generic question
    2. Extract rsIDs from response
    3. Look up user's genotype for each
    4. Get interpretation for user's specific genotype
    5. Return structured results
    """
    log("system", f"Processing query: {query}")
    agent_state["current_task"] = f"Processing: {query}"

    # Step 1: Ask Claude
    response = await query_claude(query)

    # Step 2: Extract rsIDs
    rsids = extract_rsids(response)
    log("system", f"Found {len(rsids)} SNPs mentioned: {', '.join(rsids[:10])}")

    results = {
        "query": query,
        "claude_response": response,
        "snps_found": [],
        "interpretations": []
    }

    # Step 3-4: Look up genotypes and get interpretations
    for rsid in rsids[:20]:  # Limit to 20 SNPs per query
        user_data = await get_user_genotype(rsid)

        if user_data and user_data.get("genotype"):
            genotype = user_data["genotype"]
            log("system", f"Your genotype for {rsid}: {genotype}")

            snp_result = {
                "rsid": rsid,
                "genotype": genotype,
                "chromosome": user_data.get("chromosome"),
                "position": user_data.get("position")
            }

            # Get annotation data for repute (good/bad)
            annotation = await database.get_annotation(rsid)
            if annotation:
                snp_result["repute"] = annotation.get("repute")
                snp_result["magnitude"] = annotation.get("magnitude")
                snp_result["gene"] = annotation.get("gene")

            # Get personalized interpretation
            try:
                interpretation = await interpret_genotype(
                    rsid, genotype,
                    context=f"This came up in a question about: {query}"
                )
                snp_result["interpretation"] = interpretation
                results["interpretations"].append({
                    "rsid": rsid,
                    "genotype": genotype,
                    "interpretation": interpretation
                })
            except Exception as e:
                log("error", f"Failed to interpret {rsid}: {str(e)}")

            results["snps_found"].append(snp_result)

            # Small delay to avoid rate limiting
            await asyncio.sleep(0.5)
        else:
            log("system", f"SNP {rsid} not in your genome data")

    agent_state["stats"]["queries_processed"] += 1
    agent_state["current_task"] = None

    # === COMPREHENSIVE LOGGING ===

    # 1. Log the full search query and results to data_log
    await database.log_data(
        source="claude",
        data_type="search_query",
        content=query,
        reference_id=None,
        metadata={
            "snps_found_count": len(results["snps_found"]),
            "snps_mentioned": rsids[:20],
            "has_results": len(results["snps_found"]) > 0
        }
    )

    # 2. Log the summary response
    await database.log_data(
        source="claude",
        data_type="search_summary",
        content=results["claude_response"],
        reference_id=None,
        metadata={
            "query": query,
            "snps_mentioned": rsids[:20]
        }
    )

    # 3. Save summary to RAG knowledge base
    await database.save_knowledge(
        query=query,
        response=results["claude_response"],
        snps_mentioned=rsids,
        source="search_summary"
    )

    # 4. Log and RAG each gene interpretation individually
    for snp_data in results["snps_found"]:
        if snp_data.get("interpretation"):
            # Log to data_log
            await database.log_data(
                source="claude",
                data_type="gene_interpretation",
                content=snp_data["interpretation"],
                reference_id=snp_data["rsid"],
                metadata={
                    "query": query,
                    "genotype": snp_data.get("genotype"),
                    "gene": snp_data.get("gene"),
                    "repute": snp_data.get("repute"),
                    "magnitude": snp_data.get("magnitude"),
                    "chromosome": snp_data.get("chromosome")
                }
            )

            # Save to RAG knowledge base
            rag_query = f"What does {snp_data['rsid']} {snp_data.get('genotype', '')} mean for {query}?"
            await database.save_knowledge(
                query=rag_query,
                response=snp_data["interpretation"],
                snps_mentioned=[snp_data["rsid"]],
                source="gene_interpretation"
            )

    # 5. Save full results object for complete retrieval
    await database.log_data(
        source="claude",
        data_type="search_results_full",
        content=json.dumps(results, indent=2),
        reference_id=None,
        metadata={
            "query": query,
            "snp_count": len(results["snps_found"])
        }
    )

    log("system", f"Logged search results: {len(results['snps_found'])} genes saved to data log and RAG")

    return results


async def enrich_unannotated_snps(batch_size: int = 10):
    """Background task to enrich SNPs that don't have annotations."""
    log("system", "Starting background enrichment of unannotated SNPs")

    # Get SNPs without annotations (prioritize those with known genes)
    unannotated = await database.get_unannotated_snps_sample(batch_size)

    if not unannotated:
        log("system", "No unannotated SNPs to process")
        return

    for snp in unannotated:
        if not agent_state["running"]:
            log("system", "Agent stopped, halting enrichment")
            break

        rsid = snp["rsid"]
        genotype = snp.get("genotype")

        log("system", f"Enriching {rsid} ({genotype})")
        agent_state["current_task"] = f"Enriching {rsid}"

        try:
            # Ask Claude about this SNP
            prompt = f"""What is known about SNP {rsid}?
If you know what gene it's associated with and any health/trait implications, explain briefly.
If this is a well-studied SNP, mention key findings.
If it's not well-characterized, say so."""

            response = await query_claude(prompt)

            # Save as annotation
            annotation = {
                "summary": response[:500] if len(response) > 500 else response,
                "source": "claude",
                "genotype_info": {}
            }

            # If we have the user's genotype, get specific interpretation
            if genotype:
                interpretation = await interpret_genotype(rsid, genotype)
                annotation["genotype_info"][genotype.replace(";", "")] = interpretation

            await database.save_annotation(rsid, annotation)

        except Exception as e:
            log("error", f"Failed to enrich {rsid}: {str(e)}")

        await asyncio.sleep(1)  # Rate limiting

    agent_state["current_task"] = None


async def run_learning_loop():
    """Main learning loop that continuously improves data."""
    log("system", "Learning agent started")

    while agent_state["running"]:
        try:
            # Enrich a batch of unannotated SNPs
            await enrich_unannotated_snps(batch_size=5)

            # Wait before next batch
            for _ in range(60):  # Check every second if we should stop
                if not agent_state["running"]:
                    break
                await asyncio.sleep(1)

        except Exception as e:
            log("error", f"Learning loop error: {str(e)}")
            await asyncio.sleep(10)

    log("system", "Learning agent stopped")


def start_agent():
    """Start the learning agent."""
    if agent_state["running"]:
        return {"status": "already_running"}

    agent_state["running"] = True
    asyncio.create_task(run_learning_loop())
    log("system", "Agent started")
    return {"status": "started"}


def stop_agent():
    """Stop the learning agent."""
    agent_state["running"] = False
    log("system", "Agent stopping...")
    return {"status": "stopping"}


def get_agent_status() -> dict:
    """Get current agent status and recent logs."""
    return {
        "running": agent_state["running"],
        "current_task": agent_state["current_task"],
        "stats": agent_state["stats"],
        "logs": agent_state["logs"][-50:]  # Last 50 logs
    }


def get_all_logs() -> list:
    """Get all logs."""
    return agent_state["logs"]


def clear_logs():
    """Clear the log history."""
    agent_state["logs"] = []
    log("system", "Logs cleared")
