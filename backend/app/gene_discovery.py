"""
SNP Discovery Background Worker

Continuously discovers related SNPs by querying Claude for rs numbers,
checks if we have them in our genome data, and automatically improves
any that haven't been enriched yet.
"""
import asyncio
import json
import os
import re
from datetime import datetime
from typing import Optional
from anthropic import AsyncAnthropic

from . import database

# Global state for the discovery worker
discovery_state = {
    "is_running": False,
    "should_stop": False,
    "explored_snps": set(),       # SNPs we've already queried Claude about
    "discovery_queue": [],        # rsIDs waiting to be explored
    "discovered_count": 0,        # Total new SNPs discovered
    "improved_count": 0,          # SNPs auto-improved
    "matched_count": 0,           # SNPs found in our genome
    "cycle_count": 0,
    "last_activity": None,
    "current_snp": None,
    "logs": [],
    "errors": []
}

MAX_LOGS = 200
MAX_QUEUE_SIZE = 1000
CYCLE_DELAY_SECONDS = 2          # Delay between discovery cycles
IMPROVEMENT_DELAY_SECONDS = 1    # Delay between improvement calls
RANDOM_SNP_INTERVAL = 3          # Inject random SNP every N cycles


def log_discovery(message: str, level: str = "INFO"):
    """Log to console and in-memory buffer."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_line = f"[DISCOVERY {timestamp}] [{level}] {message}"
    print(log_line, flush=True)

    discovery_state["logs"].append({
        "time": timestamp,
        "message": message,
        "level": level,
        "timestamp": datetime.now().isoformat()
    })

    if len(discovery_state["logs"]) > MAX_LOGS:
        discovery_state["logs"] = discovery_state["logs"][-MAX_LOGS:]

    discovery_state["last_activity"] = datetime.now().isoformat()


async def log_to_data_log(data_type: str, content: str, reference_id: str = None, metadata: dict = None):
    """Log discovery events to the data_log table."""
    try:
        await database.log_data(
            source="snp_discovery",
            data_type=data_type,
            content=content,
            reference_id=reference_id,
            metadata=metadata
        )
    except Exception as e:
        log_discovery(f"Failed to log to data_log: {e}", "ERROR")


async def log_claude_conversation(prompt: str, response: str, snps_mentioned: list[str] = None):
    """Log Claude conversation to chat history and data log for visibility."""
    try:
        # Save to chat history (shows in Claude conversation panel)
        await database.save_chat_message("user", f"[Discovery] {prompt}", [])
        await database.save_chat_message("assistant", response, snps_mentioned or [])

        # Also log to data_log for the Data Log tab
        await database.log_data(
            source="claude",
            data_type="discovery_conversation",
            content=response,
            reference_id=None,
            metadata={
                "prompt": prompt[:500],
                "snps_mentioned": snps_mentioned or [],
                "triggered_by": "discovery_worker"
            }
        )
    except Exception as e:
        log_discovery(f"Failed to log Claude conversation: {e}", "ERROR")


def get_claude_client() -> Optional[AsyncAnthropic]:
    """Get the Claude client if API key is configured."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    return AsyncAnthropic(api_key=api_key)


async def query_related_snps(rsid: str, context: str = "") -> list[str]:
    """Ask Claude for SNPs related to the given rsID."""
    client = get_claude_client()
    if not client:
        log_discovery("Claude API key not configured", "ERROR")
        return []

    # Get info about the source SNP if we have it
    snp_info = await database.get_snp_full_context(rsid)
    snp_context = ""
    if snp_info:
        gene = snp_info.get("gene", "unknown")
        summary = snp_info.get("summary", "")[:200]
        snp_context = f"This SNP is in gene {gene}. {summary}"

    prompt = f"""Given the SNP {rsid}, list other SNPs (rs numbers) that are:
1. In the same gene or nearby genes
2. Associated with similar traits or conditions
3. Often studied together in research
4. Part of the same biological pathway

{snp_context}

Return ONLY a JSON array of rs numbers, e.g.:
["rs429358", "rs7412", "rs1800562", "rs1801133"]

Focus on well-known, clinically relevant SNPs. Include 5-15 SNPs.
Do not include {rsid} itself."""

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text.strip()

        # Parse JSON array from response
        json_match = re.search(r'\[.*?\]', response_text, re.DOTALL)
        if json_match:
            snps = json.loads(json_match.group())
            # Clean up: lowercase, remove duplicates, filter out source
            cleaned = list(set(
                s.lower().strip() for s in snps
                if s.lower().strip().startswith('rs') and s.lower().strip() != rsid.lower()
            ))

            # Log the conversation
            await log_claude_conversation(
                f"Find SNPs related to {rsid}",
                response_text,
                cleaned
            )

            return cleaned[:15]

        log_discovery(f"Could not parse SNP list from response: {response_text[:100]}", "WARN")
        return []

    except Exception as e:
        log_discovery(f"Error querying Claude for related SNPs: {e}", "ERROR")
        discovery_state["errors"].append({
            "time": datetime.now().isoformat(),
            "error": str(e),
            "context": f"query_related_snps({rsid})"
        })
        return []


async def explore_snp_with_claude(rsid: str) -> dict:
    """Ask Claude about an SNP we don't have info on and get related SNPs."""
    client = get_claude_client()
    if not client:
        return {"error": "No client"}

    prompt = f"""Tell me about the SNP {rsid}.

Return a JSON object with:
{{
    "gene": "GENE_SYMBOL or null if unknown",
    "summary": "Brief description of what this SNP is associated with",
    "magnitude": 1-10 importance score (10 = very significant),
    "repute": "good", "bad", or "neutral",
    "related_snps": ["rs123", "rs456"] - other SNPs often studied with this one
}}

If you don't have specific information about this SNP, provide your best assessment or indicate uncertainty."""

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text.strip()

        json_match = re.search(r'\{.*?\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())

            # Log the conversation
            related = data.get("related_snps", [])
            await log_claude_conversation(
                f"Tell me about SNP {rsid}",
                response_text,
                [rsid] + (related if isinstance(related, list) else [])
            )

            return data

    except Exception as e:
        log_discovery(f"Error exploring SNP {rsid}: {e}", "ERROR")

    return {}


async def improve_snp(rsid: str) -> bool:
    """Improve a single SNP with Claude - uses same logic as manual 'Improve with Claude' button."""
    from . import claude_service

    try:
        snp = await database.get_snp_by_rsid(rsid)
        if not snp or not snp.get("genotype") or snp.get("genotype") == "--":
            return False

        # Check if already improved
        annotation = await database.get_annotation(rsid)
        if annotation:
            if annotation.get("improved_at") or annotation.get("source") in ("claude", "user"):
                return False
        else:
            # No annotation yet - fetch from SNPedia first
            from . import snpedia
            log_discovery(f"  Fetching SNPedia data for {rsid}...")
            await snpedia.fetch_snp_info(rsid)
            annotation = await database.get_annotation(rsid)
            if not annotation:
                log_discovery(f"  No SNPedia data available for {rsid}", "DEBUG")
                return False

        log_discovery(f"  Improving {rsid}...")

        result = await claude_service.improve_annotation(rsid, snp["genotype"])

        if "error" not in result:
            # Save the improved annotation with tags and title
            await database.improve_annotation(
                rsid=rsid,
                summary=result.get("improved_summary"),
                genotype_info=result.get("improved_genotype_info"),
                categories=result.get("tags"),
                title=result.get("title"),
                source="claude"
            )

            discovery_state["improved_count"] += 1
            log_discovery(f"  Improved {rsid}: {result.get('title', 'No title')}")

            # Log to data log (same as manual improve)
            await database.log_data(
                source="claude",
                data_type="annotation_improvement",
                content=result.get("improved_summary", ""),
                reference_id=rsid,
                metadata={
                    "original_summary": annotation.get("summary") if annotation else None,
                    "improved_genotype_info": result.get("improved_genotype_info"),
                    "genotype": snp["genotype"],
                    "usage": result.get("usage"),
                    "triggered_by": "discovery_worker"
                }
            )

            # Add to RAG knowledge base (same as manual improve)
            await database.save_knowledge(
                query=f"What is {rsid}? What does {snp['genotype']} mean for {rsid}?",
                response=result.get("improved_summary", ""),
                snps_mentioned=[rsid],
                source="claude_improvement"
            )

            # Save to chat history with full genotype info (same as manual improve)
            user_query = f"[Discovery] Generate a comprehensive summary for {rsid} (my genotype: {snp['genotype']})"
            await database.save_chat_message("user", user_query, [rsid])

            # Build assistant response with genotype info
            assistant_response = f"**{result.get('title', rsid)}**\n\n"
            assistant_response += result.get("improved_summary", "")

            if result.get("improved_genotype_info"):
                assistant_response += "\n\n**Genotype Interpretations:**\n"
                for gt, info in result.get("improved_genotype_info", {}).items():
                    is_yours = " (your genotype)" if gt == snp["genotype"] else ""
                    assistant_response += f"- **{gt}**{is_yours}: {info}\n"

            if result.get("tags"):
                assistant_response += f"\n**Tags:** {', '.join(result.get('tags', []))}"

            await database.save_chat_message("assistant", assistant_response, [rsid])

            return True
        else:
            log_discovery(f"  Failed to improve {rsid}: {result.get('error')}", "WARN")

    except Exception as e:
        log_discovery(f"  Error improving {rsid}: {e}", "ERROR")

    return False


async def process_discovered_snp(rsid: str, source_snp: str) -> bool:
    """Process a discovered SNP - check if we have it and improve if needed."""
    # Check if we have this SNP in our genome
    snp = await database.get_snp_by_rsid(rsid)

    if snp and snp.get("genotype") and snp.get("genotype") != "--":
        discovery_state["matched_count"] += 1
        log_discovery(f"  Found {rsid} in genome (genotype: {snp['genotype']})")

        await log_to_data_log(
            data_type="snp_matched",
            content=f"Found {rsid} in genome, discovered via {source_snp}",
            reference_id=rsid,
            metadata={"source_snp": source_snp, "genotype": snp["genotype"]}
        )

        # Try to improve it
        await improve_snp(rsid)
        return True

    return False


async def get_seed_snps() -> list[str]:
    """Get interesting SNPs to seed the discovery queue."""
    # Get SNPs we have that have annotations (good starting points)
    snps = []

    # High magnitude SNPs
    high_mag = await database.get_notable_variants(limit=20)
    snps.extend([s["rsid"] for s in high_mag])

    # Recently improved SNPs (they have good context)
    recent = await database.get_data_log(source="claude", data_type="annotation_improvement", limit=10)
    for entry in recent:
        if entry.get("reference_id"):
            snps.append(entry["reference_id"])

    # Favorites (get_favorites returns list of rsid strings)
    favs = await database.get_favorites()
    snps.extend(favs[:10])

    # Dedupe and filter already explored
    unique = []
    seen = set()
    for s in snps:
        if s and s.lower() not in seen and s.lower() not in discovery_state["explored_snps"]:
            seen.add(s.lower())
            unique.append(s.lower())

    return unique[:50]


async def explore_random_unimproved() -> bool:
    """Find and explore a random unimproved SNP."""
    log_discovery("Exploring random unimproved SNP...")

    snp = await database.get_random_unexplored_snp(discovery_state["explored_snps"])
    if not snp:
        snp_data = await database.get_random_snp_without_annotation()
        if snp_data:
            snp = snp_data

    if not snp:
        log_discovery("No unimproved SNPs found", "DEBUG")
        return False

    rsid = snp["rsid"]
    discovery_state["explored_snps"].add(rsid.lower())

    log_discovery(f"Random: {rsid} (chr{snp.get('chromosome', '?')}, {snp.get('genotype', '?')})")

    # Get info and related SNPs from Claude
    info = await explore_snp_with_claude(rsid)

    if info:
        related = info.get("related_snps", [])
        if related:
            log_discovery(f"  Related SNPs: {', '.join(related[:5])}")
            for r in related:
                r_lower = r.lower()
                if r_lower not in discovery_state["explored_snps"] and r_lower not in discovery_state["discovery_queue"]:
                    if len(discovery_state["discovery_queue"]) < MAX_QUEUE_SIZE:
                        discovery_state["discovery_queue"].append(r_lower)
                        discovery_state["discovered_count"] += 1

        # Try to improve this SNP
        await improve_snp(rsid)

        await log_to_data_log(
            data_type="random_exploration",
            content=f"Random exploration: {rsid}, gene={info.get('gene')}, found {len(related)} related",
            reference_id=rsid,
            metadata=info
        )

        return True

    return False


async def run_discovery_cycle():
    """Run a single discovery cycle."""
    discovery_state["cycle_count"] += 1

    # Periodically explore random SNPs
    if discovery_state["cycle_count"] % RANDOM_SNP_INTERVAL == 0:
        await explore_random_unimproved()
        await asyncio.sleep(IMPROVEMENT_DELAY_SECONDS)

    # Refill queue if empty
    if not discovery_state["discovery_queue"]:
        seeds = await get_seed_snps()
        if seeds:
            discovery_state["discovery_queue"] = seeds
            log_discovery(f"Reloaded queue with {len(seeds)} seed SNPs")
        else:
            log_discovery("No seed SNPs available, will try random exploration")
            await explore_random_unimproved()
            return False

    # Get next SNP to explore
    current_snp = discovery_state["discovery_queue"].pop(0)
    discovery_state["current_snp"] = current_snp
    discovery_state["explored_snps"].add(current_snp.lower())

    log_discovery(f"Exploring: {current_snp}")

    # Query Claude for related SNPs
    related_snps = await query_related_snps(current_snp)

    if related_snps:
        log_discovery(f"Found {len(related_snps)} related: {', '.join(related_snps[:5])}{'...' if len(related_snps) > 5 else ''}")

        await log_to_data_log(
            data_type="snp_exploration",
            content=f"Explored {current_snp}, found {len(related_snps)} related SNPs",
            reference_id=current_snp,
            metadata={"related_snps": related_snps}
        )

        # Process each discovered SNP
        for snp in related_snps:
            if discovery_state["should_stop"]:
                break

            snp_lower = snp.lower()

            # Add to queue if not explored
            if snp_lower not in discovery_state["explored_snps"]:
                if snp_lower not in discovery_state["discovery_queue"] and len(discovery_state["discovery_queue"]) < MAX_QUEUE_SIZE:
                    discovery_state["discovery_queue"].append(snp_lower)
                    discovery_state["discovered_count"] += 1

            # Check if we have it and improve
            await process_discovered_snp(snp, current_snp)
            await asyncio.sleep(IMPROVEMENT_DELAY_SECONDS)

    # Also try to improve the source SNP if we have it
    await process_discovered_snp(current_snp, "seed")

    discovery_state["current_snp"] = None
    return True


async def start_discovery_worker():
    """Main background loop."""
    if discovery_state["is_running"]:
        log_discovery("Discovery worker is already running", "WARN")
        return

    if not get_claude_client():
        log_discovery("Claude API key not configured - discovery worker disabled", "WARN")
        return

    discovery_state["is_running"] = True
    discovery_state["should_stop"] = False

    log_discovery("Starting SNP discovery worker...")

    # Initialize with seed SNPs
    try:
        seeds = await get_seed_snps()
        discovery_state["discovery_queue"] = seeds
        log_discovery(f"Loaded {len(seeds)} seed SNPs for exploration")

        await log_to_data_log(
            data_type="worker_started",
            content=f"SNP discovery worker started with {len(seeds)} seeds",
            metadata={"initial_seeds": seeds[:10]}
        )
    except Exception as e:
        log_discovery(f"Error loading seeds: {e}", "ERROR")
        discovery_state["is_running"] = False
        return

    # Main loop
    while not discovery_state["should_stop"]:
        try:
            await run_discovery_cycle()

            log_discovery(f"Cycle {discovery_state['cycle_count']}: Queue={len(discovery_state['discovery_queue'])}, Discovered={discovery_state['discovered_count']}, Matched={discovery_state['matched_count']}, Improved={discovery_state['improved_count']}")

            await asyncio.sleep(CYCLE_DELAY_SECONDS)

        except Exception as e:
            log_discovery(f"Error in discovery cycle: {e}", "ERROR")
            discovery_state["errors"].append({
                "time": datetime.now().isoformat(),
                "error": str(e),
                "context": "discovery_cycle"
            })
            await asyncio.sleep(10)

    discovery_state["is_running"] = False
    log_discovery("SNP discovery worker stopped")

    await log_to_data_log(
        data_type="worker_stopped",
        content="SNP discovery worker stopped",
        metadata={
            "total_explored": len(discovery_state["explored_snps"]),
            "total_improved": discovery_state["improved_count"],
            "total_matched": discovery_state["matched_count"]
        }
    )


def stop_worker():
    """Signal the worker to stop."""
    if discovery_state["is_running"]:
        log_discovery("Stopping SNP discovery worker...")
        discovery_state["should_stop"] = True


def get_status() -> dict:
    """Get current status of the discovery worker."""
    return {
        "is_running": discovery_state["is_running"],
        "explored_count": len(discovery_state["explored_snps"]),
        "queue_size": len(discovery_state["discovery_queue"]),
        "discovered_count": discovery_state["discovered_count"],
        "matched_count": discovery_state["matched_count"],
        "improved_count": discovery_state["improved_count"],
        "cycle_count": discovery_state["cycle_count"],
        "last_activity": discovery_state["last_activity"],
        "current_snp": discovery_state["current_snp"],
        "recent_errors": discovery_state["errors"][-5:] if discovery_state["errors"] else []
    }


def get_logs(limit: int = 100) -> list[dict]:
    """Get recent discovery logs."""
    return discovery_state["logs"][-limit:]


def clear_explored():
    """Clear the explored SNPs set to allow re-exploration."""
    discovery_state["explored_snps"].clear()
    log_discovery("Cleared explored SNPs set - will re-explore all SNPs")
