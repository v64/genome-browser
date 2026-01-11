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

from . import database, snpedia

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


async def auto_fetch_snpedia_for_rsids(rsids: list[str]):
    """
    Background task to fetch SNPedia data for rsIDs that don't have annotations.
    Called when rsIDs are mentioned in Claude conversations.
    """
    if not rsids:
        return

    for rsid in rsids[:30]:  # Limit to 30 per batch
        # Check if we already have annotation data
        existing = await database.get_annotation(rsid)

        # Skip if we already have SNPedia data (not just Claude data)
        if existing and existing.get("source") == "snpedia":
            continue
        if existing and existing.get("ref_urls"):  # Has SNPedia refs
            continue

        # Fetch from SNPedia in background
        try:
            log("system", f"Auto-fetching SNPedia data for {rsid}")
            result = await snpedia.fetch_snp_info(rsid)
            if result:
                log("system", f"Fetched SNPedia data for {rsid}: {result.get('gene', 'no gene')}")
            else:
                log("system", f"No SNPedia data found for {rsid}")
        except Exception as e:
            log("error", f"Failed to fetch SNPedia for {rsid}: {str(e)}")

        # Rate limiting
        await asyncio.sleep(0.5)


def parse_genotype_request(text: str) -> list[str]:
    """
    Check if Claude is requesting genotype information.
    Returns list of rsIDs Claude wants to look up, or empty list.

    Claude should format requests like:
    GENOTYPE_REQUEST: rs123, rs456, rs789
    """
    match = re.search(r'GENOTYPE_REQUEST:\s*([^\n]+)', text, re.IGNORECASE)
    if match:
        rsids_str = match.group(1)
        return extract_rsids(rsids_str)
    return []


async def lookup_genotypes_for_claude(rsids: list[str]) -> str:
    """
    Look up user's genotypes for a list of rsIDs and format for Claude.
    Also includes any existing annotation summary.
    """
    from . import snpedia

    results = []
    for rsid in rsids[:30]:  # Limit to 30 lookups
        snp = await database.get_snp_by_rsid(rsid)
        annotation = await database.get_annotation(rsid)

        if snp and snp.get("genotype"):
            genotype = snp["genotype"]

            # Check for strand conversion
            display_genotype = genotype.replace(";", "").upper()
            strand_note = ""
            if annotation and annotation.get("genotype_info"):
                _, matched_gt = snpedia.get_genotype_interpretation(
                    annotation["genotype_info"],
                    display_genotype
                )
                if matched_gt and matched_gt != display_genotype:
                    strand_note = f" (reported as {display_genotype} by 23andMe, converted to {matched_gt} for opposite strand)"
                    display_genotype = matched_gt

            info = f"- {rsid}: genotype {display_genotype}{strand_note}"

            # Add annotation summary if available
            if annotation:
                if annotation.get("gene"):
                    info += f", gene: {annotation['gene']}"
                if annotation.get("summary"):
                    summary = annotation["summary"][:200]
                    info += f"\n  Summary: {summary}..."
                if annotation.get("genotype_info", {}).get(display_genotype):
                    interp = annotation["genotype_info"][display_genotype][:150]
                    info += f"\n  Your genotype meaning: {interp}..."

            results.append(info)
        else:
            results.append(f"- {rsid}: NOT IN USER'S GENOME DATA")

    if not results:
        return "No genotype data found for the requested SNPs."

    return "Here is the user's genotype data:\n\n" + "\n".join(results)


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
    """Ask Claude to interpret a specific genotype and classify it."""
    # Check if we already have an interpretation
    existing = await database.get_annotation(rsid)
    if existing and existing.get("genotype_info", {}).get(genotype):
        log("system", f"Using cached interpretation for {rsid} {genotype}")
        return existing["genotype_info"][genotype]

    prompt = f"""For the SNP {rsid}, what does having the {genotype} genotype mean?
{f'Context: {context}' if context else ''}

Be specific about health implications, traits, or other effects.

IMPORTANT: At the END of your response, add a classification line in this exact format:
CLASSIFICATION: [label] | [confidence] | [frequency]

Where:
- label is one of: normal, abnormal, rare, protective, risk, carrier, neutral
- confidence is one of: high, medium, low
- frequency is the approximate population percentage if known (e.g., "45%" or "unknown")

Example endings:
"CLASSIFICATION: normal | high | 45%"
"CLASSIFICATION: rare | medium | 2%"
"CLASSIFICATION: risk | high | 15%"

Keep the main interpretation to 2-3 sentences, then add the classification line."""

    interpretation = await query_claude(prompt)

    # Extract classification from response
    label_info = extract_genotype_classification(interpretation)

    # Clean interpretation (remove the classification line for display)
    clean_interpretation = re.sub(r'\s*CLASSIFICATION:.*$', '', interpretation, flags=re.IGNORECASE).strip()

    # Save genotype label if extracted
    if label_info:
        await database.set_genotype_label(
            rsid=rsid,
            label=label_info["label"],
            confidence=label_info.get("confidence"),
            population_frequency=label_info.get("frequency"),
            notes=f"Genotype: {genotype}",
            source="claude"
        )
        log("system", f"Labeled {rsid} ({genotype}) as: {label_info['label']}")

    # Save to annotations
    await save_genotype_interpretation(rsid, genotype, clean_interpretation)

    return clean_interpretation


def extract_genotype_classification(text: str) -> Optional[dict]:
    """Extract genotype classification from Claude's response."""
    # Look for CLASSIFICATION: label | confidence | frequency
    match = re.search(r'CLASSIFICATION:\s*(\w+)\s*\|\s*(\w+)\s*\|\s*([^\n]+)', text, re.IGNORECASE)
    if match:
        label = match.group(1).lower().strip()
        confidence = match.group(2).lower().strip()
        frequency_str = match.group(3).strip()

        # Parse frequency percentage
        freq_match = re.search(r'([\d.]+)%', frequency_str)
        frequency = float(freq_match.group(1)) if freq_match else None

        # Validate label
        valid_labels = {'normal', 'abnormal', 'rare', 'protective', 'risk', 'carrier', 'neutral'}
        if label not in valid_labels:
            label = 'neutral'  # Default

        return {
            "label": label,
            "confidence": confidence if confidence in ('high', 'medium', 'low') else 'medium',
            "frequency": frequency
        }
    return None


async def save_genotype_interpretation(rsid: str, genotype: str, interpretation: str):
    """Save a genotype interpretation to the database."""
    from . import snpedia

    existing = await database.get_annotation(rsid) or {}
    genotype_info = existing.get("genotype_info", {})

    # Determine the correct genotype key to use
    # If existing annotations use different alleles (opposite strand), convert
    raw_gt = genotype.replace(";", "").upper()
    genotype_key = raw_gt

    if genotype_info:
        # Check if we need to use the complement strand
        _, matched_gt = snpedia.get_genotype_interpretation(genotype_info, raw_gt)
        if matched_gt and matched_gt != raw_gt:
            # Use the matched genotype (which is on the correct strand)
            genotype_key = matched_gt
        elif matched_gt is None:
            # No match found, check if complement alleles match existing alleles
            comp_gt = snpedia.complement_genotype(raw_gt)
            existing_alleles = set()
            for gt in genotype_info.keys():
                existing_alleles.update(gt.upper())
            comp_alleles = set(comp_gt.upper())
            raw_alleles = set(raw_gt.upper())

            # If complement alleles overlap with existing but raw don't, use complement
            if comp_alleles & existing_alleles and not (raw_alleles & existing_alleles):
                genotype_key = comp_gt

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
    Process a generic query with multi-turn genome lookup support.

    Flow:
    1. Ask Claude with instruction that it can request genome lookups
    2. If Claude requests genotypes, look them up and continue conversation
    3. Extract final rsIDs and provide interpretations
    4. Return structured results
    """
    import os
    from anthropic import Anthropic

    log("system", f"Processing query: {query}")
    agent_state["current_task"] = f"Processing: {query}"

    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    # System prompt that enables Claude to request genome data
    system_prompt = """You are a genetics research assistant with access to the user's 23andMe genome data.

When answering questions about genetics, traits, or health conditions:
1. Be scientifically accurate but accessible
2. Always cite specific rsIDs (like rs12345) when relevant
3. Distinguish between well-established findings and preliminary research
4. For health-related queries, note this is informational, not medical advice

IMPORTANT - GENOME LOOKUP CAPABILITY:
If answering the user's question would benefit from knowing their specific genotypes, you can REQUEST this information.
To request genotype lookups, include a line in this EXACT format at the END of your response:

GENOTYPE_REQUEST: rs123, rs456, rs789

For example, if asked "What unusual genes do I have related to sleep?", you might first explain the key sleep-related genes, then request:
GENOTYPE_REQUEST: rs73598374, rs1800497, rs4680, rs1801260, rs12927162

I will then look up those SNPs in the user's genome and provide you with their actual genotypes.
After receiving the genotype data, provide a personalized summary based on their specific results.

If you don't need to look up any genotypes (the question is general knowledge or doesn't require personalization), just answer directly without a GENOTYPE_REQUEST line."""

    messages = [{"role": "user", "content": query}]

    # Log the initial query
    await log_async("user", query)

    # First API call
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=system_prompt,
            messages=messages
        )
        response_text = response.content[0].text

    except Exception as e:
        await log_async("error", f"Claude API error: {str(e)}")
        raise

    # Check if Claude is requesting genotype lookups
    requested_rsids = parse_genotype_request(response_text)

    if requested_rsids:
        log("system", f"Claude requested genotypes for: {', '.join(requested_rsids)}")

        # Log Claude's initial response (with request)
        await log_async("claude", response_text)

        # Look up the genotypes
        genotype_data = await lookup_genotypes_for_claude(requested_rsids)
        log("system", f"Looked up {len(requested_rsids)} SNPs from genome")

        # Continue conversation with genotype data
        messages.append({"role": "assistant", "content": response_text})
        messages.append({"role": "user", "content": genotype_data})

        # Log the genotype data we're sending back to Claude
        await log_async("user", f"[Genome Lookup]\n{genotype_data}")

        # Second API call with genotype data
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                system=system_prompt + "\n\nYou have now received the user's genotype data. Provide a personalized analysis based on their specific results. Do NOT include another GENOTYPE_REQUEST.",
                messages=messages
            )
            response_text = response.content[0].text

        except Exception as e:
            await log_async("error", f"Claude API error on follow-up: {str(e)}")
            raise

    # Log final Claude response
    await log_async("claude", response_text)
    rsids = extract_rsids(response_text)

    # Also include the requested rsids (may have more context)
    all_rsids = list(set(rsids + requested_rsids))
    log("system", f"Found {len(all_rsids)} SNPs total: {', '.join(all_rsids[:10])}")

    results = {
        "query": query,
        "claude_response": response_text,
        "snps_found": [],
        "interpretations": [],
        "genotypes_requested": requested_rsids  # Track what Claude asked for
    }

    # Log to unified data log
    await database.log_data(
        source="claude",
        data_type="conversation",
        content=response_text,
        reference_id=None,
        metadata={
            "prompt": query,
            "rsids_mentioned": rsids,
            "genotypes_looked_up": requested_rsids,
            "model": "claude-sonnet-4-20250514",
            "multi_turn": len(requested_rsids) > 0
        }
    )

    # Save to knowledge base
    await database.save_knowledge(
        query=query,
        response=response_text,
        snps_mentioned=all_rsids,
        source="claude_conversation"
    )

    # Auto-fetch SNPedia data for mentioned rsIDs in background
    if all_rsids:
        asyncio.create_task(auto_fetch_snpedia_for_rsids(all_rsids))

    # Look up genotypes and get interpretations for SNPs mentioned
    for rsid in all_rsids[:20]:  # Limit to 20 SNPs per query
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
