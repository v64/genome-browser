import os
import re
import json
from anthropic import Anthropic
from typing import Optional
from . import database

# Initialize client (will use ANTHROPIC_API_KEY env var)
client: Optional[Anthropic] = None


def get_client() -> Anthropic:
    """Get or create the Anthropic client."""
    global client
    if client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        client = Anthropic(api_key=api_key)
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
    """Format SNP data for Claude context."""
    parts = [f"**{snp_data['rsid']}** (Your genotype: {snp_data['genotype']})"]

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

    if snp_data.get("genotype_info"):
        parts.append("Genotype interpretations:")
        for gt, info in snp_data["genotype_info"].items():
            is_yours = "(YOUR GENOTYPE)" if gt == snp_data["genotype"] else ""
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
    model: str = "claude-sonnet-4-20250514"
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

    response = anthropic.messages.create(
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


async def improve_annotation(rsid: str, genotype: str) -> dict:
    """Ask Claude to rewrite/improve an annotation in clear, accessible language."""
    snp_data = await database.get_snp_full_context(rsid)

    if not snp_data:
        return {"error": f"SNP {rsid} not found"}

    current_context = format_snp_context(snp_data)

    anthropic = get_client()

    message = f"""I have this SNP annotation from SNPedia that needs to be rewritten in clearer, more accessible language.

Current annotation data:
{current_context}

Please provide:
1. A clear, concise summary (2-3 sentences) explaining what this SNP does and why it matters
2. For each genotype variant, a clear explanation of what it means in plain English

Return your response as JSON with this exact format:
{{
    "summary": "Your improved summary here",
    "genotype_info": {{
        "AA": "What having AA means",
        "AG": "What having AG means",
        "GG": "What having GG means"
    }}
}}

Only include genotypes that are actually relevant for this SNP. Make the language accessible to someone without a genetics background. Focus on practical implications."""

    response = anthropic.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": message}]
    )

    response_text = response.content[0].text

    # Parse JSON from response
    try:
        # Find JSON in response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            improved = json.loads(json_match.group())
            return {
                "rsid": rsid,
                "improved_summary": improved.get("summary"),
                "improved_genotype_info": improved.get("genotype_info", {}),
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

    response = anthropic.messages.create(
        model="claude-sonnet-4-20250514",
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

                explain_response = anthropic.messages.create(
                    model="claude-sonnet-4-20250514",
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
