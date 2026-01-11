"""
RAG (Retrieval-Augmented Generation) module for knowledge base.

Uses simple TF-IDF-like keyword matching for similarity search.
This avoids heavy dependencies while still providing useful retrieval.
For production, could be upgraded to use sentence-transformers or OpenAI embeddings.
"""

import re
import json
import numpy as np
from typing import Optional
from . import database


def tokenize(text: str) -> list[str]:
    """Simple tokenization: lowercase, split on non-alphanumeric, remove short tokens."""
    text = text.lower()
    tokens = re.findall(r'\b[a-z0-9]+\b', text)
    # Filter out very short tokens and common stop words
    stop_words = {'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
                  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                  'would', 'could', 'should', 'may', 'might', 'must', 'shall',
                  'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
                  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
                  'through', 'during', 'before', 'after', 'above', 'below',
                  'between', 'under', 'again', 'further', 'then', 'once',
                  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either',
                  'neither', 'not', 'only', 'own', 'same', 'than', 'too',
                  'very', 'just', 'also', 'now', 'here', 'there', 'when',
                  'where', 'why', 'how', 'all', 'each', 'every', 'both',
                  'few', 'more', 'most', 'other', 'some', 'such', 'no',
                  'any', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
                  'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her',
                  'it', 'its', 'they', 'them', 'their', 'what', 'which',
                  'who', 'whom', 'this', 'that', 'these', 'those', 'am'}
    return [t for t in tokens if len(t) > 2 and t not in stop_words]


def create_embedding(text: str) -> bytes:
    """
    Create a simple bag-of-words embedding.
    Returns JSON-encoded token frequencies.
    """
    tokens = tokenize(text)
    # Count token frequencies
    freq = {}
    for token in tokens:
        freq[token] = freq.get(token, 0) + 1
    # Normalize by total tokens
    total = sum(freq.values()) or 1
    freq = {k: v / total for k, v in freq.items()}
    return json.dumps(freq).encode('utf-8')


def embedding_similarity(emb1: bytes, emb2: bytes) -> float:
    """
    Compute cosine-like similarity between two embeddings.
    """
    try:
        freq1 = json.loads(emb1.decode('utf-8'))
        freq2 = json.loads(emb2.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return 0.0

    # Get all unique tokens
    all_tokens = set(freq1.keys()) | set(freq2.keys())
    if not all_tokens:
        return 0.0

    # Compute dot product and magnitudes
    dot_product = 0.0
    mag1 = 0.0
    mag2 = 0.0

    for token in all_tokens:
        v1 = freq1.get(token, 0)
        v2 = freq2.get(token, 0)
        dot_product += v1 * v2
        mag1 += v1 * v1
        mag2 += v2 * v2

    if mag1 == 0 or mag2 == 0:
        return 0.0

    return dot_product / (np.sqrt(mag1) * np.sqrt(mag2))


async def find_similar_knowledge(query: str, top_k: int = 3, threshold: float = 0.1) -> list[dict]:
    """
    Find knowledge entries similar to the query.

    Args:
        query: The search query
        top_k: Maximum number of results to return
        threshold: Minimum similarity score (0-1)

    Returns:
        List of similar knowledge entries with similarity scores
    """
    query_embedding = create_embedding(query)

    # Get all knowledge with embeddings
    all_entries = await database.get_all_knowledge_embeddings()

    if not all_entries:
        return []

    # Calculate similarities
    similarities = []
    for entry_id, embedding in all_entries:
        if embedding:
            score = embedding_similarity(query_embedding, embedding)
            if score >= threshold:
                similarities.append((entry_id, score))

    # Sort by similarity (highest first)
    similarities.sort(key=lambda x: x[1], reverse=True)

    # Get full knowledge entries for top results
    results = []
    for entry_id, score in similarities[:top_k]:
        entry = await database.get_knowledge(entry_id)
        if entry:
            entry["similarity_score"] = round(score, 3)
            results.append(entry)

    return results


async def get_rag_context(query: str, max_entries: int = 2) -> str:
    """
    Get relevant context from knowledge base for a query.

    Returns formatted string to include in Claude's prompt.
    """
    similar = await find_similar_knowledge(query, top_k=max_entries)

    if not similar:
        return ""

    context_parts = []
    for entry in similar:
        context_parts.append(f"Q: {entry['query']}\nA: {entry['response'][:500]}...")

    return "\n\n".join(context_parts)


async def save_with_embedding(
    query: str,
    response: str,
    snps_mentioned: list[str],
    category: Optional[str] = None
) -> int:
    """Save knowledge with auto-generated embedding."""
    # Create embedding from both query and response
    combined_text = f"{query} {response}"
    embedding = create_embedding(combined_text)

    return await database.save_knowledge(
        query=query,
        response=response,
        snps_mentioned=snps_mentioned,
        category=category,
        embedding=embedding
    )
