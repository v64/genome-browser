import os
import re
import json
from anthropic import AsyncAnthropic
from typing import Optional
from . import database
from . import snpedia

# Initialize async client (will use ANTHROPIC_API_KEY env var)
client: Optional[AsyncAnthropic] = None


def get_client() -> AsyncAnthropic:
    """Get or create the async Anthropic client."""
    global client
    if client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        client = AsyncAnthropic(api_key=api_key)
    return client


def get_system_prompt(snp_count: int, rag_context: str = "", snp_context: str = "") -> str:
    """Generate the system prompt with genome context."""
    base = f"""You are a genetics research assistant with access to the user's 23andMe genome data.
You have {snp_count:,} SNPs loaded from their genome.

When answering questions:
1. Be scientifically accurate but accessible to a non-expert
2. Always cite specific rsIDs when relevant (format: rs12345)
3. Distinguish between well-established findings and preliminary research
4. For health-related queries, remind the user this is informational, not medical advice
5. When asked about traits/conditions, list relevant SNPs they can look up
6. If you mention a specific SNP, I will look up their genotype for it

Format SNP references as rs followed by numbers (e.g., rs429358, rs12913832).
When listing multiple SNPs related to a trait, format them as a clear list."""

    if snp_context:
        base += f"\n\n**SNP Data from local database:**\n{snp_context}"

    if rag_context:
        base += f"\n\n**Previous relevant knowledge:**\n{rag_context}"

    return base


def format_snp_context(snp_data: dict) -> str:
    """Format SNP data for Claude context, handling strand conversion."""
    raw_genotype = snp_data.get('genotype', '')
    genotype_info = snp_data.get("genotype_info", {})

    # Detect strand conversion needed
    display_genotype = raw_genotype
    strand_note = ""

    if genotype_info:
        _, matched_gt = snpedia.get_genotype_interpretation(genotype_info, raw_genotype)
        if matched_gt and matched_gt != raw_genotype:
            display_genotype = matched_gt
            strand_note = f" (23andMe reports: {raw_genotype} on opposite strand)"

    parts = [f"**{snp_data['rsid']}** (Your genotype: {display_genotype}{strand_note})"]

    if snp_data.get("gene"):
        parts.append(f"Gene: {snp_data['gene']}")

    if snp_data.get("chromosome"):
        parts.append(f"Location: Chr{snp_data['chromosome']}:{snp_data.get('position', '?')}")

    if snp_data.get("summary"):
        parts.append(f"Summary: {snp_data['summary']}")

    if snp_data.get("magnitude") is not None:
        parts.append(f"Importance: {snp_data['magnitude']}/10")

    if snp_data.get("repute"):
        parts.append(f"Effect: {snp_data['repute']}")

    if genotype_info:
        parts.append("Genotype interpretations:")
        for gt, info in genotype_info.items():
            is_yours = "(YOUR GENOTYPE)" if gt == display_genotype else ""
            parts.append(f"  - {gt} {is_yours}: {info}")

    if snp_data.get("categories"):
        parts.append(f"Categories: {', '.join(snp_data['categories'])}")

    return "\n".join(parts)


def extract_snp_ids(text: str) -> list[str]:
    """Extract all SNP rsIDs mentioned in text."""
    pattern = r'\brs\d+\b'
    matches = re.findall(pattern, text.lower())
    seen = set()
    unique = []
    for m in matches:
        if m not in seen:
            seen.add(m)
            unique.append(m)
    return unique


async def build_snp_context(message: str, additional_rsids: list[str] = None) -> str:
    """Build SNP context from message and additional rsids."""
    # Extract SNPs mentioned in the user's message
    mentioned_snps = extract_snp_ids(message)

    # Add any additional rsids
    if additional_rsids:
        for rsid in additional_rsids:
            if rsid.lower() not in mentioned_snps:
                mentioned_snps.append(rsid.lower())

    if not mentioned_snps:
        return ""

    # Get full context for these SNPs
    snps_data = await database.get_snps_with_annotations(mentioned_snps)

    if not snps_data:
        return ""

    context_parts = []
    for snp in snps_data:
        context_parts.append(format_snp_context(snp))

    return "\n\n".join(context_parts)


async def chat(
    message: str,
    conversation_history: list[dict] = None,
    rag_context: str = "",
    snp_context: str = "",
    model: str = "claude-sonnet-4-5"
) -> dict:
    """Send a message to Claude and get a response."""
    anthropic = get_client()

    snp_count = await database.get_snp_count()

    # Build SNP context from message if not provided
    if not snp_context:
        snp_context = await build_snp_context(message)

    messages = []

    if conversation_history:
        for msg in conversation_history[-10:]:
            messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })

    messages.append({
        "role": "user",
        "content": message
    })

    response = await anthropic.messages.create(
        model=model,
        max_tokens=2048,
        system=get_system_prompt(snp_count, rag_context, snp_context),
        messages=messages
    )

    response_text = response.content[0].text
    snps_mentioned = extract_snp_ids(response_text)

    # Look up user's genotypes for mentioned SNPs
    if snps_mentioned:
        user_snps = await database.get_snps_by_rsids(snps_mentioned)
        snp_genotypes = {snp["rsid"]: snp["genotype"] for snp in user_snps}

        if snp_genotypes:
            genotype_info = "\n\n---\n**Your genotypes for mentioned SNPs:**\n"
            for rsid, genotype in snp_genotypes.items():
                genotype_info += f"- {rsid}: **{genotype}**\n"
            response_text += genotype_info

    return {
        "response": response_text,
        "snps_mentioned": snps_mentioned,
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens
        }
    }


async def explain_snp(rsid: str, genotype: str) -> dict:
    """Get Claude's explanation for a specific SNP and genotype, with annotation context."""
    # Get full SNP context including annotation
    snp_data = await database.get_snp_full_context(rsid)

    snp_context = ""
    if snp_data:
        snp_context = format_snp_context(snp_data)

    message = f"""Please explain what the SNP {rsid} is associated with, and what having the genotype {genotype} might mean.

Include:
1. What gene this SNP is in (if known)
2. What traits or conditions it's associated with
3. What my specific genotype ({genotype}) suggests
4. How common this genotype is in different populations (if known)
5. Any relevant research findings

Be specific and cite the rsID. If the local database information seems outdated or unclear, please provide the most accurate current understanding."""

    return await chat(message, snp_context=snp_context)


async def improve_annotation(rsid: str, genotype: str, custom_instructions: str = None) -> dict:
    """Ask Claude to create a comprehensive summary with all available context and citations."""
    snp_data = await database.get_snp_full_context(rsid)

    if not snp_data:
        return {"error": f"SNP {rsid} not found"}

    # Detect strand conversion
    genotype_info = snp_data.get("genotype_info", {})
    raw_genotype = snp_data.get("genotype", genotype)
    display_genotype = raw_genotype
    alleles_to_use = None
    strand_instruction = ""

    if genotype_info:
        _, matched_gt = snpedia.get_genotype_interpretation(genotype_info, raw_genotype)
        if matched_gt and matched_gt != raw_genotype:
            display_genotype = matched_gt
            # Determine which alleles are being used in existing annotations
            existing_alleles = set()
            for gt in genotype_info.keys():
                existing_alleles.update(gt.upper())
            alleles_to_use = '/'.join(sorted(existing_alleles))
            strand_instruction = f"""
IMPORTANT STRAND NOTE: The user's 23andMe data reports genotype "{raw_genotype}", but this SNP's annotations use the opposite strand with alleles {alleles_to_use}.
The user's converted genotype is "{display_genotype}".
You MUST use {alleles_to_use} alleles for ALL genotype_info keys (e.g., {', '.join(sorted(existing_alleles) + sorted(existing_alleles)[:1])} combinations like {''.join(sorted(existing_alleles))}, {''.join([sorted(existing_alleles)[0]]*2)}, {''.join([sorted(existing_alleles)[-1]]*2)}).
DO NOT use A/G alleles if the annotations use C/T alleles, and vice versa.
"""

    current_context = format_snp_context(snp_data)

    # Gather ALL context about this SNP
    knowledge_entries = await database.get_knowledge_for_snp(rsid)
    chat_messages = await database.get_chat_messages_for_snp(rsid)
    data_log_entries = await database.get_data_log(reference_id=rsid, limit=100)

    # Build context sections with citation IDs
    context_parts = []
    citation_sources = []

    # Add knowledge entries
    for i, entry in enumerate(knowledge_entries or []):
        cite_id = f"knowledge_{entry.get('id', i)}"
        citation_sources.append({
            "id": cite_id,
            "type": "knowledge",
            "db_id": entry.get('id'),
            "preview": entry.get('query', '')[:50]
        })
        context_parts.append(f"""
[SOURCE: {cite_id}]
Query: {entry.get('query', 'N/A')}
Response: {entry.get('response', 'N/A')[:2000]}
""")

    # Add chat messages - group into conversations
    if chat_messages:
        convo_text = []
        for msg in chat_messages:
            convo_text.append(f"{msg['role'].upper()}: {msg['content']}")

        if convo_text:
            cite_id = "chat_history"
            citation_sources.append({
                "id": cite_id,
                "type": "conversation",
                "preview": "Previous chat discussions"
            })
            context_parts.append(f"""
[SOURCE: {cite_id}]
Previous conversations mentioning {rsid}:
{chr(10).join(convo_text[:20])}
""")

    # Add relevant data log entries (interpretations, not raw data)
    interpretation_entries = [e for e in (data_log_entries or [])
                             if e.get('data_type') in ('interpretation', 'gene_interpretation', 'conversation', 'search_query')]
    for i, entry in enumerate(interpretation_entries[:10]):
        cite_id = f"datalog_{entry.get('id', i)}"
        citation_sources.append({
            "id": cite_id,
            "type": "datalog",
            "db_id": entry.get('id'),
            "data_type": entry.get('data_type'),
            "preview": entry.get('content', '')[:50]
        })
        content = entry.get('content', '')
        # Try to extract meaningful content from JSON
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                content = parsed.get('response') or parsed.get('content') or content
        except:
            pass
        context_parts.append(f"""
[SOURCE: {cite_id}]
Type: {entry.get('data_type')}
Content: {str(content)[:1500]}
""")

    anthropic = get_client()

    # Build the comprehensive prompt
    all_context = "\n---\n".join(context_parts) if context_parts else "No additional context available."

    # Determine example genotypes based on alleles in use
    if alleles_to_use:
        allele_list = sorted(existing_alleles)
        if len(allele_list) >= 2:
            example_genotypes = f'"{allele_list[0]}{allele_list[0]}", "{allele_list[0]}{allele_list[1]}", "{allele_list[1]}{allele_list[1]}"'
        else:
            # Only one allele known, just show homozygous
            example_genotypes = f'"{allele_list[0]}{allele_list[0]}"'
    else:
        example_genotypes = '"AA", "AG", "GG"'

    message = f"""I have this SNP ({rsid}) and I want you to create a COMPREHENSIVE summary that synthesizes ALL the information we have about it.
{strand_instruction}
**Current SNPedia annotation:**
{current_context}

**Additional context from our knowledge base and previous conversations:**
{all_context}

Your task:
1. Create a SHORT DESCRIPTIVE TITLE (3-6 words) that captures the essence of what this SNP affects - like a headline
2. Create a thorough summary that covers EVERYTHING we know about this SNP - from the base annotation AND from all the additional context (conversations about traits, conditions, behaviors, etc.)
3. Include CITATIONS in your summary using [cite:SOURCE_ID] format wherever you reference information from a specific source
4. For each genotype variant, provide comprehensive explanations that incorporate all relevant context
5. Provide rich TAGS that describe what this SNP is related to - be generous with tags!

IMPORTANT: Your summary should be comprehensive - if there's information in the context about how this SNP relates to specific traits (like mathematical ability, caffeine sensitivity, stress response, etc.), include that with citations!

Return your response as JSON with this exact format:
{{
    "title": "Short Descriptive Title Here",
    "summary": "Your comprehensive summary here with [cite:knowledge_123] inline citations",
    "genotype_info": {{
        {example_genotypes.replace('"', '')}: "Use the correct alleles shown in the existing annotations"
    }},
    "tags": ["tag1", "tag2", "tag3", ...]
}}

TITLE GUIDELINES:
- 3-6 words that capture what this SNP is most known for
- Examples: "Caffeine Metabolism Speed", "Bitter Taste Perception", "Alzheimer's Risk Factor", "Muscle Performance Type", "Vitamin D Processing"
- Be specific and descriptive, not generic

TAGS GUIDELINES - Be generous and specific! Include tags for:
- Body systems: "brain", "heart", "liver", "immune system", "nervous system", "metabolism"
- Traits: "intelligence", "memory", "creativity", "athletic performance", "sleep", "anxiety", "mood"
- Health: "cancer risk", "cardiovascular", "diabetes", "alzheimers", "mental health", "longevity"
- Lifestyle: "caffeine", "alcohol", "nicotine", "diet", "exercise response", "drug metabolism"
- Categories: "pharmacogenomics", "ancestry", "nutrition", "cognition", "personality", "physical traits"
- Specific conditions or traits mentioned in the context
Use lowercase for all tags. Aim for 5-15 relevant tags per SNP.

CRITICAL: Use ONLY the alleles that appear in the existing genotype annotations (check the genotype_info keys above). If the annotations use C/T alleles, your genotype_info keys MUST be CC, CT, TT - NOT AA, AG, GG. The user's genotype to highlight is: {display_genotype}

GENOTYPE_INFO STYLE: Write genotype explanations in an encyclopedic, third-person style. Do NOT use phrases like "YOUR GENOTYPE", "You have", "This is your result", etc. Instead write neutrally, e.g., "CC carriers typically..." or "This genotype is associated with..." The UI already shows which genotype belongs to the user.

Only include genotypes that are actually relevant for this SNP. Make the language accessible but thorough. The goal is for this summary to be the definitive reference for everything we know about this SNP."""

    # Add custom instructions if provided
    if custom_instructions and custom_instructions.strip():
        message += f"""

**SPECIAL USER REQUEST:**
{custom_instructions.strip()}

Please prioritize addressing this specific request while still providing the complete JSON response format."""

    response = await anthropic.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": message}]
    )

    response_text = response.content[0].text

    # Parse JSON from response
    try:
        # Find JSON in response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            improved = json.loads(json_match.group())

            # Extract and normalize tags
            tags = improved.get("tags", [])
            if tags:
                # Ensure lowercase, dedupe, strip whitespace
                tags = list(set(tag.lower().strip() for tag in tags if isinstance(tag, str) and tag.strip()))

            # Extract title
            title = improved.get("title", "").strip()

            return {
                "rsid": rsid,
                "title": title if title else None,
                "improved_summary": improved.get("summary"),
                "improved_genotype_info": improved.get("genotype_info", {}),
                "tags": tags,
                "citations": citation_sources,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                }
            }
    except json.JSONDecodeError:
        pass

    return {
        "error": "Failed to parse Claude's response",
        "raw_response": response_text
    }


async def natural_language_search(query: str) -> dict:
    """
    Process a natural language query and return structured search results.
    Claude interprets the query and returns SNPs with explanations.
    """
    anthropic = get_client()
    snp_count = await database.get_snp_count()

    # First, get some sample SNPs to give Claude context about what data we have
    sample_snps = await database.query_snps_advanced(
        has_annotation=True,
        min_magnitude=2,
        limit=20
    )

    sample_context = "Sample of annotated SNPs in the database:\n"
    for snp in sample_snps[:10]:
        sample_context += f"- {snp['rsid']}: {snp.get('gene', 'unknown gene')}, magnitude {snp.get('magnitude', '?')}, categories: {snp.get('categories', [])}\n"

    message = f"""The user is searching their genome with this query: "{query}"

I have {snp_count:,} SNPs from their 23andMe data. Here's a sample of what's annotated:
{sample_context}

Analyze the user's query and determine:
1. What kind of SNPs they're looking for
2. What database filters would help (magnitude, repute, categories, specific genes)
3. What SNPs are most relevant to their query

Return your response as JSON:
{{
    "interpretation": "Brief explanation of what the user is looking for",
    "search_type": "one of: specific_snps, category, trait, risk_assessment, rare_variants, general",
    "filters": {{
        "min_magnitude": null or number,
        "max_magnitude": null or number,
        "repute": null or "good" or "bad",
        "categories": null or ["list", "of", "categories"],
        "gene": null or "gene name pattern"
    }},
    "specific_rsids": ["rs123", "rs456"] or null if not looking for specific SNPs,
    "explanation_template": "For each result, explain: [what to highlight about each SNP]"
}}"""

    response = await anthropic.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": message}]
    )

    response_text = response.content[0].text

    try:
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            search_params = json.loads(json_match.group())

            # Execute the search based on Claude's interpretation
            filters = search_params.get("filters", {})

            if search_params.get("specific_rsids"):
                # Look up specific SNPs
                results = await database.get_snps_with_annotations(search_params["specific_rsids"])
            else:
                # Use advanced query
                results = await database.query_snps_advanced(
                    min_magnitude=filters.get("min_magnitude"),
                    max_magnitude=filters.get("max_magnitude"),
                    repute=filters.get("repute"),
                    categories=filters.get("categories"),
                    gene=filters.get("gene"),
                    has_annotation=True,
                    limit=50
                )

            # Now ask Claude to explain each result in context of the query
            if results:
                results_context = "\n".join([
                    f"- {r['rsid']} ({r['genotype']}): {r.get('summary', 'No summary')[:100]}..."
                    for r in results[:20]
                ])

                explain_message = f"""For the query "{query}", I found these SNPs.
For each one, provide a brief (1-2 sentence) explanation of why it's relevant and what the user's genotype means.

Results:
{results_context}

Return as JSON array:
[
    {{"rsid": "rs123", "relevance": "Why this SNP is relevant to the query", "interpretation": "What their genotype means"}}
]"""

                explain_response = await anthropic.messages.create(
                    model="claude-sonnet-4-5",
                    max_tokens=2048,
                    messages=[{"role": "user", "content": explain_message}]
                )

                try:
                    explain_json = re.search(r'\[[\s\S]*\]', explain_response.content[0].text)
                    if explain_json:
                        explanations = json.loads(explain_json.group())
                        # Merge explanations with results
                        explain_map = {e["rsid"]: e for e in explanations}
                        for r in results:
                            if r["rsid"] in explain_map:
                                r["relevance"] = explain_map[r["rsid"]].get("relevance", "")
                                r["interpretation"] = explain_map[r["rsid"]].get("interpretation", "")
                except:
                    pass

            return {
                "query": query,
                "interpretation": search_params.get("interpretation", ""),
                "search_type": search_params.get("search_type", "general"),
                "results": results,
                "total": len(results),
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                }
            }
    except json.JSONDecodeError:
        pass

    return {
        "query": query,
        "error": "Failed to process query",
        "results": [],
        "total": 0
    }


async def search_traits(trait_query: str) -> dict:
    """Ask Claude about SNPs related to a trait or condition."""
    message = f"""What genetic variants (SNPs) are associated with {trait_query}?

Please list:
1. The most well-studied SNPs related to this trait
2. What each SNP does and which genes they're in
3. Which genotypes are associated with which outcomes
4. The strength of evidence for each association

Format the SNPs as rsIDs (e.g., rs12345) so I can look up my genotypes."""

    return await chat(message)


def is_configured() -> bool:
    """Check if the Claude API is configured."""
    return bool(os.getenv("ANTHROPIC_API_KEY"))
