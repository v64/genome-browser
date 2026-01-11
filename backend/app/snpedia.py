import httpx
import re
import asyncio
from typing import Optional
from . import database


SNPEDIA_API = "https://bots.snpedia.com/api.php"

# Rate limiting
REQUEST_DELAY = 0.5  # seconds between requests


async def add_annotation_to_knowledge(rsid: str, annotation: dict):
    """Add SNPedia annotation to knowledge base for RAG retrieval."""
    if not annotation.get("summary") and not annotation.get("genotype_info"):
        return

    # Build a rich text representation for RAG
    parts = [f"SNP: {rsid}"]

    if annotation.get("gene"):
        parts.append(f"Gene: {annotation['gene']}")

    if annotation.get("summary"):
        parts.append(f"Summary: {annotation['summary']}")

    if annotation.get("magnitude") is not None:
        parts.append(f"Importance: {annotation['magnitude']}/10")

    if annotation.get("repute"):
        parts.append(f"Effect: {annotation['repute']}")

    if annotation.get("genotype_info"):
        parts.append("Genotype interpretations:")
        for gt, info in annotation["genotype_info"].items():
            parts.append(f"  {gt}: {info}")

    response_text = "\n".join(parts)

    # Determine category from annotation categories
    category = None
    if annotation.get("categories"):
        category = annotation["categories"][0]  # Use first category

    await database.save_knowledge(
        query=f"What is {rsid}? What does {annotation.get('gene', rsid)} do?",
        response=response_text,
        snps_mentioned=[rsid],
        category=category,
        source="snpedia"
    )


async def fetch_snp_info(rsid: str, use_cache: bool = True) -> Optional[dict]:
    """
    Fetch SNP information from SNPedia.
    Returns parsed annotation data or None if not found.

    Uses local cache when available to avoid hitting SNPedia repeatedly.
    """
    # Check annotation cache first - if we have it, no network needed at all
    if use_cache:
        cached = await database.get_annotation(rsid)
        if cached:
            print(f"[CACHE HIT] {rsid}: Using cached annotation (no network)")
            return cached

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Check if we have the page cached locally
            cached_page = await database.get_cached_snpedia_page(rsid)

            if cached_page:
                wikitext = cached_page["wikitext"]
                categories = cached_page["categories"]
                print(f"[CACHE HIT] {rsid}: Using cached SNPedia page (no network)")
            else:
                print(f"[NETWORK] {rsid}: Fetching from SNPedia (first time only)")
                # Fetch from SNPedia
                params = {
                    "action": "parse",
                    "page": rsid.lower(),
                    "format": "json",
                    "prop": "wikitext|categories"
                }
                response = await client.get(SNPEDIA_API, params=params)
                data = response.json()

                if "error" in data:
                    return None

                parse_data = data.get("parse", {})
                wikitext = parse_data.get("wikitext", {}).get("*", "")
                categories = [c["*"] for c in parse_data.get("categories", [])]

                # Cache the full page locally
                await database.cache_snpedia_page(rsid, wikitext, categories)

                # Log this data ingestion
                await database.log_data(
                    source="snpedia",
                    data_type="main_page",
                    content=wikitext,
                    reference_id=rsid,
                    metadata={"categories": categories, "page_type": "main"}
                )

                # Also save full wikitext to knowledge base for RAG
                await database.save_knowledge(
                    query=f"SNPedia page for {rsid}",
                    response=wikitext,
                    snps_mentioned=[rsid],
                    source="snpedia_raw"
                )

            # Parse the wikitext for relevant info
            annotation = parse_wikitext(rsid, wikitext, categories)

            # Try to get genotype-specific info (also returns magnitude/repute from genotype pages)
            genotype_info, gt_magnitude, gt_repute = await fetch_genotype_info(client, rsid)
            if genotype_info:
                annotation["genotype_info"] = genotype_info

            # Use magnitude/repute from genotype pages if not found on main page
            if annotation["magnitude"] is None and gt_magnitude is not None:
                annotation["magnitude"] = gt_magnitude
            if annotation["repute"] is None and gt_repute is not None:
                annotation["repute"] = gt_repute

            # Cache the result
            await database.save_annotation(rsid, annotation)

            # Also add parsed annotation to knowledge base for RAG
            await add_annotation_to_knowledge(rsid, annotation)

            await asyncio.sleep(REQUEST_DELAY)
            return annotation

    except Exception as e:
        print(f"Error fetching {rsid}: {e}")
        return None


async def fetch_genotype_info(client: httpx.AsyncClient, rsid: str) -> dict:
    """Fetch genotype-specific interpretations with local caching."""
    genotype_info = {}
    magnitude_repute = {"magnitude": None, "repute": None}
    cache_hits = 0
    network_fetches = 0

    # Common genotype patterns - use uppercase for page names
    genotypes = ["A;A", "A;C", "A;G", "A;T", "C;C", "C;G", "C;T", "G;G", "G;T", "T;T",
                 "A;-", "C;-", "G;-", "T;-", "-;-", "I;I", "D;D", "I;D"]

    # SNPedia uses Rs1801133(C;C) format - capitalize first letter of rsid, uppercase alleles
    rsid_formatted = rsid[0:2].capitalize() + rsid[2:]

    for gt in genotypes:
        page_name = f"{rsid_formatted}({gt})"  # e.g., Rs1801133(C;C)

        try:
            # Check cache first - we NEVER hit SNPedia twice for the same page
            cached_page = await database.get_cached_snpedia_page(page_name)

            if cached_page:
                wikitext = cached_page["wikitext"]
                cache_hits += 1
            else:
                params = {
                    "action": "parse",
                    "page": page_name,
                    "format": "json",
                    "prop": "wikitext"
                }
                response = await client.get(SNPEDIA_API, params=params)
                data = response.json()

                if "error" in data:
                    continue

                wikitext = data.get("parse", {}).get("wikitext", {}).get("*", "")
                network_fetches += 1

                # Cache the genotype page locally - will never fetch again
                await database.cache_snpedia_page(page_name, wikitext)

                # Log this data ingestion
                await database.log_data(
                    source="snpedia",
                    data_type="genotype_page",
                    content=wikitext,
                    reference_id=page_name,
                    metadata={"rsid": rsid, "genotype": gt, "page_type": "genotype"}
                )

            # Extract summary from genotype page
            summary = extract_genotype_summary(wikitext)
            if summary:
                gt_normalized = gt.replace(";", "")
                genotype_info[gt_normalized] = summary

            # Extract magnitude and repute from genotype template
            mag_match = re.search(r"\|magnitude\s*=\s*([\d.]+)", wikitext, re.IGNORECASE)
            if mag_match:
                try:
                    mag = float(mag_match.group(1))
                    if mag > (magnitude_repute.get("_max_mag") or 0):
                        magnitude_repute["magnitude"] = mag
                        magnitude_repute["_max_mag"] = mag
                except ValueError:
                    pass

            repute_match = re.search(r"\|repute\s*=\s*(\w+)", wikitext, re.IGNORECASE)
            if repute_match and magnitude_repute["repute"] is None:
                repute = repute_match.group(1).lower()
                if repute in ["good", "bad", "neutral"]:
                    magnitude_repute["repute"] = repute

        except Exception:
            continue

    # Log cache efficiency
    if cache_hits > 0 or network_fetches > 0:
        print(f"  {rsid} genotype pages: {cache_hits} from cache, {network_fetches} from network")

    # Return both genotype info and the best magnitude/repute found
    return genotype_info, magnitude_repute.get("magnitude"), magnitude_repute.get("repute")


def parse_wikitext(rsid: str, wikitext: str, categories: list[str]) -> dict:
    """Parse SNPedia wikitext format to extract structured data."""
    annotation = {
        "summary": None,
        "magnitude": None,
        "repute": None,
        "gene": None,
        "categories": [],
        "genotype_info": {},
        "references": []
    }

    # Extract magnitude
    mag_match = re.search(r"\|magnitude\s*=\s*([\d.]+)", wikitext, re.IGNORECASE)
    if mag_match:
        try:
            annotation["magnitude"] = float(mag_match.group(1))
        except ValueError:
            pass

    # Extract repute (good/bad/neutral)
    repute_match = re.search(r"\|repute\s*=\s*(\w+)", wikitext, re.IGNORECASE)
    if repute_match:
        repute = repute_match.group(1).lower()
        if repute in ["good", "bad", "neutral"]:
            annotation["repute"] = repute

    # Extract gene
    gene_match = re.search(r"\|gene\s*=\s*([^\|\}]+)", wikitext, re.IGNORECASE)
    if gene_match:
        annotation["gene"] = gene_match.group(1).strip()

    # Extract summary (first paragraph after template)
    summary = extract_summary(wikitext)
    if summary:
        annotation["summary"] = summary

    # Process categories into our category system
    annotation["categories"] = map_categories(categories)

    # Extract references/links
    refs = re.findall(r"\[https?://[^\]]+\]", wikitext)
    annotation["references"] = [extract_url(ref) for ref in refs[:5]]

    return annotation


def extract_genotype_summary(wikitext: str) -> Optional[str]:
    """Extract summary from genotype page wikitext."""
    # Look for summary in the genotype template
    summary_match = re.search(r"\|summary\s*=\s*([^|}]+)", wikitext, re.IGNORECASE)
    if summary_match:
        summary = summary_match.group(1).strip()
        if summary and len(summary) > 5:
            return summary
    return None


def extract_summary(wikitext: str) -> Optional[str]:
    """Extract a clean summary from wikitext."""
    # Skip redirects
    if wikitext.strip().upper().startswith("#REDIRECT"):
        return None

    # Remove template blocks
    text = re.sub(r"\{\{[^}]+\}\}", "", wikitext)

    # Remove wiki markup
    text = re.sub(r"\[\[([^\]|]+)\|?([^\]]*)\]\]", lambda m: m.group(2) or m.group(1), text)
    text = re.sub(r"'''?", "", text)
    text = re.sub(r"\[https?://[^\]]+\s+([^\]]+)\]", r"\1", text)
    text = re.sub(r"\[https?://[^\]]+\]", "", text)

    # Clean up whitespace
    text = re.sub(r"\s+", " ", text).strip()

    # Get first meaningful sentence(s)
    sentences = text.split(".")
    summary_parts = []
    for s in sentences[:3]:
        s = s.strip()
        if len(s) > 20:  # Skip very short fragments
            summary_parts.append(s)

    if summary_parts:
        return ". ".join(summary_parts) + "."

    return None


def extract_url(ref: str) -> str:
    """Extract URL from wiki reference."""
    match = re.search(r"\[(https?://[^\s\]]+)", ref)
    return match.group(1) if match else ref


def complement_base(base: str) -> str:
    """Get the complement of a DNA base."""
    complements = {'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C', '-': '-'}
    return complements.get(base.upper(), base)


def complement_genotype(genotype: str) -> str:
    """Get the complement of a genotype (for strand conversion)."""
    return ''.join(complement_base(b) for b in genotype)


def get_genotype_interpretation(genotype_info: dict, user_genotype: str) -> tuple[str, str]:
    """
    Find the interpretation for a user's genotype, handling strand differences.
    Returns (interpretation, matched_genotype) or (None, None) if not found.
    """
    if not genotype_info or not user_genotype:
        return None, None

    # Normalize user genotype (remove any separators, uppercase)
    user_gt = user_genotype.replace(";", "").replace("/", "").upper()

    # Try direct match
    if user_gt in genotype_info:
        return genotype_info[user_gt], user_gt

    # Try reversed order (AG vs GA)
    user_gt_rev = user_gt[::-1]
    if user_gt_rev in genotype_info:
        return genotype_info[user_gt_rev], user_gt_rev

    # Try complement (for opposite strand)
    user_gt_comp = complement_genotype(user_gt)
    if user_gt_comp in genotype_info:
        return genotype_info[user_gt_comp], user_gt_comp

    # Try complement reversed
    user_gt_comp_rev = user_gt_comp[::-1]
    if user_gt_comp_rev in genotype_info:
        return genotype_info[user_gt_comp_rev], user_gt_comp_rev

    return None, None


def map_categories(wiki_categories: list[str]) -> list[str]:
    """Map SNPedia categories to our simplified category system."""
    categories = []

    category_mapping = {
        "health": ["medical", "medicine", "disease", "condition", "syndrome", "cancer",
                  "cardiovascular", "diabetes", "alzheimer", "parkinson", "autoimmune"],
        "traits": ["trait", "phenotype", "appearance", "physical", "eye", "hair", "skin",
                  "taste", "smell", "metabolism"],
        "intelligence": ["cognition", "cognitive", "intelligence", "memory", "learning",
                        "brain", "neurological", "psychiatric", "mental"],
        "ancestry": ["ancestry", "population", "haplogroup", "ethnic", "geographic"]
    }

    for cat in wiki_categories:
        cat_lower = cat.lower()
        for our_cat, keywords in category_mapping.items():
            if any(kw in cat_lower for kw in keywords):
                if our_cat not in categories:
                    categories.append(our_cat)

    return categories


async def batch_fetch_annotations(rsids: list[str], progress_callback=None) -> int:
    """
    Fetch annotations for multiple SNPs.
    Returns count of successfully fetched annotations.
    """
    # Filter out already-annotated SNPs
    to_fetch = await database.get_unannotated_rsids(rsids)

    fetched = 0
    for i, rsid in enumerate(to_fetch):
        result = await fetch_snp_info(rsid)
        if result:
            fetched += 1

        if progress_callback:
            progress_callback(i + 1, len(to_fetch), rsid)

    return fetched
