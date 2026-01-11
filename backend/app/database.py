import aiosqlite
import json
from pathlib import Path
from datetime import datetime
from typing import Optional

DATABASE_PATH = Path(__file__).parent.parent.parent / "data" / "cache.db"


async def init_db():
    """Initialize the database with required tables."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS snps (
                rsid TEXT PRIMARY KEY,
                chromosome TEXT,
                position INTEGER,
                genotype TEXT
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS annotations (
                rsid TEXT PRIMARY KEY,
                summary TEXT,
                magnitude REAL,
                repute TEXT,
                gene TEXT,
                categories TEXT,
                genotype_info TEXT,
                ref_urls TEXT,
                fetched_at TIMESTAMP,
                source TEXT DEFAULT 'snpedia',
                original_summary TEXT,
                original_genotype_info TEXT,
                improved_at TIMESTAMP
            )
        """)

        # Migration: add new columns if they don't exist
        try:
            await db.execute("ALTER TABLE annotations ADD COLUMN source TEXT DEFAULT 'snpedia'")
        except:
            pass  # Column already exists
        try:
            await db.execute("ALTER TABLE annotations ADD COLUMN original_summary TEXT")
        except:
            pass
        try:
            await db.execute("ALTER TABLE annotations ADD COLUMN original_genotype_info TEXT")
        except:
            pass
        try:
            await db.execute("ALTER TABLE annotations ADD COLUMN improved_at TIMESTAMP")
        except:
            pass

        await db.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                rsid TEXT PRIMARY KEY,
                added_at TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS sync_state (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        # Knowledge base for RAG
        await db.execute("""
            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                response TEXT NOT NULL,
                snps_mentioned TEXT,
                category TEXT,
                embedding BLOB,
                source TEXT DEFAULT 'claude',
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        """)

        # Chat history
        await db.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                snps_extracted TEXT,
                source TEXT DEFAULT 'chat',
                created_at TIMESTAMP
            )
        """)

        # Migration: add source to chat_history
        try:
            await db.execute("ALTER TABLE chat_history ADD COLUMN source TEXT DEFAULT 'chat'")
        except:
            pass

        # SNPedia page cache - store full wikitext
        await db.execute("""
            CREATE TABLE IF NOT EXISTS snpedia_cache (
                page_name TEXT PRIMARY KEY,
                page_type TEXT DEFAULT 'main',
                wikitext TEXT NOT NULL,
                categories TEXT,
                fetched_at TIMESTAMP
            )
        """)

        # Migration: add page_type to snpedia_cache
        try:
            await db.execute("ALTER TABLE snpedia_cache ADD COLUMN page_type TEXT DEFAULT 'main'")
        except:
            pass

        # Unified data log - tracks ALL data ingestion
        await db.execute("""
            CREATE TABLE IF NOT EXISTS data_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                data_type TEXT NOT NULL,
                reference_id TEXT,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TIMESTAMP
            )
        """)

        # Genotype labels - classify genotypes as normal, abnormal, rare, etc.
        await db.execute("""
            CREATE TABLE IF NOT EXISTS genotype_labels (
                rsid TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                confidence TEXT,
                population_frequency REAL,
                notes TEXT,
                source TEXT DEFAULT 'claude',
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        """)

        # Create indexes for faster searching
        await db.execute("CREATE INDEX IF NOT EXISTS idx_snps_chromosome ON snps(chromosome)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_annotations_magnitude ON annotations(magnitude)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_annotations_gene ON annotations(gene)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_genotype_labels_label ON genotype_labels(label)")

        await db.commit()


async def get_db():
    """Get a database connection."""
    return await aiosqlite.connect(DATABASE_PATH)


async def insert_snps(snps: list[dict]):
    """Bulk insert SNPs into the database."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.executemany(
            "INSERT OR REPLACE INTO snps (rsid, chromosome, position, genotype) VALUES (?, ?, ?, ?)",
            [(s["rsid"], s["chromosome"], s["position"], s["genotype"]) for s in snps]
        )
        await db.commit()


async def get_snp(rsid: str) -> Optional[dict]:
    """Get a single SNP by rsid."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM snps WHERE rsid = ?", (rsid,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def search_snps(
    search: Optional[str] = None,
    chromosome: Optional[str] = None,
    category: Optional[str] = None,
    min_magnitude: Optional[float] = None,
    repute: Optional[str] = None,
    favorites_only: bool = False,
    limit: int = 50,
    offset: int = 0
) -> tuple[list[dict], int]:
    """Search SNPs with various filters. Returns (results, total_count)."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Build the query
        base_query = """
            SELECT s.*, a.summary, a.magnitude, a.repute, a.gene, a.categories,
                   a.genotype_info, a.ref_urls, a.fetched_at,
                   CASE WHEN f.rsid IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                   CASE WHEN a.rsid IS NOT NULL THEN 1 ELSE 0 END as has_annotation
            FROM snps s
            LEFT JOIN annotations a ON s.rsid = a.rsid
            LEFT JOIN favorites f ON s.rsid = f.rsid
        """

        conditions = []
        params = []

        if search:
            conditions.append("""
                (s.rsid LIKE ? OR a.gene LIKE ? OR a.summary LIKE ? OR a.categories LIKE ?)
            """)
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern, search_pattern, search_pattern])

        if chromosome:
            conditions.append("s.chromosome = ?")
            params.append(chromosome)

        if category:
            conditions.append("a.categories LIKE ?")
            params.append(f"%{category}%")

        if min_magnitude is not None:
            conditions.append("a.magnitude >= ?")
            params.append(min_magnitude)

        if repute:
            conditions.append("a.repute = ?")
            params.append(repute)

        if favorites_only:
            conditions.append("f.rsid IS NOT NULL")

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        # Get total count
        count_query = f"SELECT COUNT(*) FROM snps s LEFT JOIN annotations a ON s.rsid = a.rsid LEFT JOIN favorites f ON s.rsid = f.rsid {where_clause}"
        async with db.execute(count_query, params) as cursor:
            total = (await cursor.fetchone())[0]

        # Get paginated results (prioritize annotated SNPs)
        order_clause = " ORDER BY a.magnitude DESC NULLS LAST, s.rsid"
        query = f"{base_query} {where_clause} {order_clause} LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                # Parse JSON fields
                r["categories"] = json.loads(r["categories"]) if r["categories"] else []
                r["genotype_info"] = json.loads(r["genotype_info"]) if r["genotype_info"] else {}
                r["references"] = json.loads(r["ref_urls"]) if r.get("ref_urls") else []
                r.pop("ref_urls", None)
                r["is_favorite"] = bool(r["is_favorite"])
                r["has_annotation"] = bool(r["has_annotation"])
                results.append(r)

            return results, total


async def save_annotation(rsid: str, annotation: dict, source: str = "snpedia"):
    """Save an annotation for a SNP."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO annotations
            (rsid, summary, magnitude, repute, gene, categories, genotype_info, ref_urls, fetched_at, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            rsid,
            annotation.get("summary"),
            annotation.get("magnitude"),
            annotation.get("repute"),
            annotation.get("gene"),
            json.dumps(annotation.get("categories", [])),
            json.dumps(annotation.get("genotype_info", {})),
            json.dumps(annotation.get("references", [])),
            datetime.now().isoformat(),
            source
        ))
        await db.commit()


async def improve_annotation(
    rsid: str,
    summary: Optional[str] = None,
    genotype_info: Optional[dict] = None,
    categories: Optional[list[str]] = None,
    source: str = "claude"
) -> bool:
    """Improve an annotation, preserving the original."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Get current annotation
        async with db.execute("SELECT * FROM annotations WHERE rsid = ?", (rsid,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return False
            current = dict(row)

        updates = ["source = ?", "improved_at = ?"]
        params = [source, datetime.now().isoformat()]

        if summary is not None:
            # Preserve original if not already saved
            if not current.get("original_summary"):
                updates.append("original_summary = ?")
                params.append(current.get("summary"))
            updates.append("summary = ?")
            params.append(summary)

        if genotype_info is not None:
            # Preserve original if not already saved
            if not current.get("original_genotype_info"):
                updates.append("original_genotype_info = ?")
                params.append(current.get("genotype_info"))
            updates.append("genotype_info = ?")
            params.append(json.dumps(genotype_info))

        if categories is not None:
            # Merge with existing categories, dedupe
            existing_cats = []
            if current.get("categories"):
                try:
                    existing_cats = json.loads(current["categories"])
                except:
                    pass
            # Combine existing and new, dedupe while preserving order
            all_cats = list(existing_cats)
            for cat in categories:
                if cat.lower() not in [c.lower() for c in all_cats]:
                    all_cats.append(cat.lower())
            updates.append("categories = ?")
            params.append(json.dumps(all_cats))

        params.append(rsid)

        await db.execute(
            f"UPDATE annotations SET {', '.join(updates)} WHERE rsid = ?",
            params
        )
        await db.commit()
        return True


async def revert_annotation(rsid: str) -> bool:
    """Revert an annotation to its original SNPedia version."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        async with db.execute("SELECT * FROM annotations WHERE rsid = ?", (rsid,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return False
            current = dict(row)

        if not current.get("original_summary") and not current.get("original_genotype_info"):
            return False  # Nothing to revert

        updates = ["source = 'snpedia'", "improved_at = NULL"]
        params = []

        if current.get("original_summary"):
            updates.append("summary = ?")
            params.append(current["original_summary"])
            updates.append("original_summary = NULL")

        if current.get("original_genotype_info"):
            updates.append("genotype_info = ?")
            params.append(current["original_genotype_info"])
            updates.append("original_genotype_info = NULL")

        params.append(rsid)

        await db.execute(
            f"UPDATE annotations SET {', '.join(updates)} WHERE rsid = ?",
            params
        )
        await db.commit()
        return True


async def get_annotation(rsid: str) -> Optional[dict]:
    """Get annotation for a SNP."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM annotations WHERE rsid = ?", (rsid,)) as cursor:
            row = await cursor.fetchone()
            if row:
                r = dict(row)
                r["categories"] = json.loads(r["categories"]) if r["categories"] else []
                r["genotype_info"] = json.loads(r["genotype_info"]) if r["genotype_info"] else {}
                r["original_genotype_info"] = json.loads(r["original_genotype_info"]) if r.get("original_genotype_info") else None
                r["references"] = json.loads(r["ref_urls"]) if r.get("ref_urls") else []
                r.pop("ref_urls", None)
                r["is_improved"] = r.get("source") in ("claude", "user")
                return r
            return None


async def add_favorite(rsid: str):
    """Add a SNP to favorites."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO favorites (rsid, added_at) VALUES (?, ?)",
            (rsid, datetime.now().isoformat())
        )
        await db.commit()


async def remove_favorite(rsid: str):
    """Remove a SNP from favorites."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("DELETE FROM favorites WHERE rsid = ?", (rsid,))
        await db.commit()


async def get_favorites() -> list[str]:
    """Get all favorite rsids."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("SELECT rsid FROM favorites ORDER BY added_at DESC") as cursor:
            rows = await cursor.fetchall()
            return [row[0] for row in rows]


async def get_snp_count() -> int:
    """Get total number of SNPs."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM snps") as cursor:
            return (await cursor.fetchone())[0]


async def get_annotation_count() -> int:
    """Get number of annotated SNPs."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM annotations") as cursor:
            return (await cursor.fetchone())[0]


async def get_chromosome_counts() -> dict[str, int]:
    """Get SNP counts per chromosome."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("SELECT chromosome, COUNT(*) FROM snps GROUP BY chromosome") as cursor:
            rows = await cursor.fetchall()
            return {row[0]: row[1] for row in rows}


async def get_notable_variants(limit: int = 20) -> list[dict]:
    """Get high-magnitude variants for dashboard."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = """
            SELECT s.*, a.summary, a.magnitude, a.repute, a.gene, a.categories,
                   a.genotype_info, a.ref_urls, a.fetched_at,
                   CASE WHEN f.rsid IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                   1 as has_annotation
            FROM snps s
            JOIN annotations a ON s.rsid = a.rsid
            LEFT JOIN favorites f ON s.rsid = f.rsid
            WHERE a.magnitude >= 2
            ORDER BY a.magnitude DESC
            LIMIT ?
        """
        async with db.execute(query, (limit,)) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                r["categories"] = json.loads(r["categories"]) if r["categories"] else []
                r["genotype_info"] = json.loads(r["genotype_info"]) if r["genotype_info"] else {}
                r["references"] = json.loads(r["ref_urls"]) if r.get("ref_urls") else []
                r.pop("ref_urls", None)
                r["is_favorite"] = bool(r["is_favorite"])
                r["has_annotation"] = bool(r["has_annotation"])
                results.append(r)
            return results


async def get_unannotated_rsids(rsids: list[str]) -> list[str]:
    """Get rsids that don't have annotations yet."""
    if not rsids:
        return []

    async with aiosqlite.connect(DATABASE_PATH) as db:
        placeholders = ",".join("?" * len(rsids))
        query = f"""
            SELECT rsid FROM snps
            WHERE rsid IN ({placeholders})
            AND rsid NOT IN (SELECT rsid FROM annotations)
        """
        async with db.execute(query, rsids) as cursor:
            rows = await cursor.fetchall()
            return [row[0] for row in rows]


# ============== Knowledge Base Functions ==============

async def save_knowledge(
    query: str,
    response: str,
    snps_mentioned: list[str],
    category: Optional[str] = None,
    embedding: Optional[bytes] = None,
    source: str = "claude"
) -> int:
    """Save a knowledge entry. Returns the new entry ID."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("""
            INSERT INTO knowledge (query, response, snps_mentioned, category, embedding, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            query,
            response,
            json.dumps(snps_mentioned),
            category,
            embedding,
            source,
            datetime.now().isoformat(),
            datetime.now().isoformat()
        ))
        await db.commit()
        return cursor.lastrowid


async def get_knowledge(knowledge_id: int) -> Optional[dict]:
    """Get a single knowledge entry."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM knowledge WHERE id = ?", (knowledge_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                r = dict(row)
                r["snps_mentioned"] = json.loads(r["snps_mentioned"]) if r["snps_mentioned"] else []
                return r
            return None


async def search_knowledge(
    search: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 20
) -> list[dict]:
    """Search knowledge entries."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        conditions = []
        params = []

        if search:
            conditions.append("(query LIKE ? OR response LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])

        if category:
            conditions.append("category = ?")
            params.append(category)

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
        query = f"SELECT * FROM knowledge {where_clause} ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                r["snps_mentioned"] = json.loads(r["snps_mentioned"]) if r["snps_mentioned"] else []
                # Don't include embedding in response
                r.pop("embedding", None)
                results.append(r)
            return results


async def get_all_knowledge_embeddings() -> list[tuple[int, bytes]]:
    """Get all knowledge entries with embeddings for similarity search."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("SELECT id, embedding FROM knowledge WHERE embedding IS NOT NULL") as cursor:
            return await cursor.fetchall()


async def update_knowledge(
    knowledge_id: int,
    response: Optional[str] = None,
    category: Optional[str] = None,
    snps_mentioned: Optional[list[str]] = None
) -> bool:
    """Update a knowledge entry."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        updates = ["updated_at = ?"]
        params = [datetime.now().isoformat()]

        if response is not None:
            updates.append("response = ?")
            params.append(response)
            updates.append("source = 'user_edited'")

        if category is not None:
            updates.append("category = ?")
            params.append(category)

        if snps_mentioned is not None:
            updates.append("snps_mentioned = ?")
            params.append(json.dumps(snps_mentioned))

        params.append(knowledge_id)

        await db.execute(
            f"UPDATE knowledge SET {', '.join(updates)} WHERE id = ?",
            params
        )
        await db.commit()
        return True


async def delete_knowledge(knowledge_id: int) -> bool:
    """Delete a knowledge entry."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("DELETE FROM knowledge WHERE id = ?", (knowledge_id,))
        await db.commit()
        return True


# ============== Chat History Functions ==============

async def save_chat_message(role: str, content: str, snps_extracted: list[str] = None) -> int:
    """Save a chat message. Returns the message ID."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("""
            INSERT INTO chat_history (role, content, snps_extracted, created_at)
            VALUES (?, ?, ?, ?)
        """, (
            role,
            content,
            json.dumps(snps_extracted or []),
            datetime.now().isoformat()
        ))
        await db.commit()
        return cursor.lastrowid


async def get_chat_history(limit: int = 50) -> list[dict]:
    """Get recent chat history."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?",
            (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in reversed(rows):  # Reverse to get chronological order
                r = dict(row)
                r["snps_extracted"] = json.loads(r["snps_extracted"]) if r["snps_extracted"] else []
                results.append(r)
            return results


async def clear_chat_history() -> bool:
    """Clear all chat history."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("DELETE FROM chat_history")
        await db.commit()
        return True


async def get_chat_messages_for_snp(rsid: str) -> list[dict]:
    """Get all chat messages that mention a specific SNP."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Search for rsid in the snps_extracted JSON array
        query = """
            SELECT * FROM chat_history
            WHERE snps_extracted LIKE ?
            ORDER BY created_at ASC
        """
        async with db.execute(query, (f'%"{rsid}"%',)) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                r["snps_extracted"] = json.loads(r["snps_extracted"]) if r["snps_extracted"] else []
                results.append(r)
            return results


async def get_knowledge_for_snp(rsid: str) -> list[dict]:
    """Get all knowledge base entries mentioning a specific SNP."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Search for rsid in snps_mentioned JSON array or in query/response text
        query = """
            SELECT * FROM knowledge
            WHERE snps_mentioned LIKE ?
               OR query LIKE ?
               OR response LIKE ?
            ORDER BY created_at DESC
        """
        pattern = f'%{rsid}%'
        async with db.execute(query, (f'%"{rsid}"%', pattern, pattern)) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                r["snps_mentioned"] = json.loads(r["snps_mentioned"]) if r["snps_mentioned"] else []
                results.append(r)
            return results


async def get_snps_by_rsids(rsids: list[str]) -> list[dict]:
    """Get SNP data for a list of rsids."""
    if not rsids:
        return []

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        placeholders = ",".join("?" * len(rsids))
        query = f"SELECT * FROM snps WHERE rsid IN ({placeholders})"
        async with db.execute(query, rsids) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def get_snp_by_rsid(rsid: str) -> Optional[dict]:
    """Get a single SNP by rsid (alias for get_snp)."""
    return await get_snp(rsid)


async def get_unannotated_snps_sample(limit: int = 10) -> list[dict]:
    """Get a sample of SNPs that don't have annotations yet."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Prioritize SNPs that might be more interesting (random sample for now)
        query = """
            SELECT s.*
            FROM snps s
            LEFT JOIN annotations a ON s.rsid = a.rsid
            WHERE a.rsid IS NULL
            ORDER BY RANDOM()
            LIMIT ?
        """
        async with db.execute(query, (limit,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def get_snps_with_annotations(rsids: list[str]) -> list[dict]:
    """Get SNPs with full annotation data for Claude context."""
    if not rsids:
        return []

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        placeholders = ",".join("?" * len(rsids))
        query = f"""
            SELECT s.*, a.summary, a.magnitude, a.repute, a.gene, a.categories,
                   a.genotype_info, a.ref_urls, a.source as annotation_source
            FROM snps s
            LEFT JOIN annotations a ON s.rsid = a.rsid
            WHERE s.rsid IN ({placeholders})
        """
        async with db.execute(query, rsids) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                r["categories"] = json.loads(r["categories"]) if r.get("categories") else []
                r["genotype_info"] = json.loads(r["genotype_info"]) if r.get("genotype_info") else {}
                r["references"] = json.loads(r["ref_urls"]) if r.get("ref_urls") else []
                r.pop("ref_urls", None)
                results.append(r)
            return results


async def get_snp_full_context(rsid: str) -> Optional[dict]:
    """Get full SNP context including annotation for Claude."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = """
            SELECT s.*, a.summary, a.magnitude, a.repute, a.gene, a.categories,
                   a.genotype_info, a.ref_urls, a.source as annotation_source,
                   a.original_summary, a.original_genotype_info
            FROM snps s
            LEFT JOIN annotations a ON s.rsid = a.rsid
            WHERE s.rsid = ?
        """
        async with db.execute(query, (rsid,)) as cursor:
            row = await cursor.fetchone()
            if row:
                r = dict(row)
                r["categories"] = json.loads(r["categories"]) if r.get("categories") else []
                r["genotype_info"] = json.loads(r["genotype_info"]) if r.get("genotype_info") else {}
                r["original_genotype_info"] = json.loads(r["original_genotype_info"]) if r.get("original_genotype_info") else None
                r["references"] = json.loads(r["ref_urls"]) if r.get("ref_urls") else []
                r.pop("ref_urls", None)
                return r
            return None


async def query_snps_advanced(
    chromosome: Optional[str] = None,
    min_magnitude: Optional[float] = None,
    max_magnitude: Optional[float] = None,
    repute: Optional[str] = None,
    categories: Optional[list[str]] = None,
    has_annotation: Optional[bool] = None,
    gene: Optional[str] = None,
    limit: int = 100
) -> list[dict]:
    """Advanced SNP query for Claude-driven searches."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        query = """
            SELECT s.*, a.summary, a.magnitude, a.repute, a.gene, a.categories,
                   a.genotype_info, a.ref_urls, a.source as annotation_source
            FROM snps s
            LEFT JOIN annotations a ON s.rsid = a.rsid
        """

        conditions = []
        params = []

        if chromosome:
            conditions.append("s.chromosome = ?")
            params.append(chromosome)

        if min_magnitude is not None:
            conditions.append("a.magnitude >= ?")
            params.append(min_magnitude)

        if max_magnitude is not None:
            conditions.append("a.magnitude <= ?")
            params.append(max_magnitude)

        if repute:
            conditions.append("a.repute = ?")
            params.append(repute)

        if categories:
            cat_conditions = []
            for cat in categories:
                cat_conditions.append("a.categories LIKE ?")
                params.append(f"%{cat}%")
            conditions.append(f"({' OR '.join(cat_conditions)})")

        if has_annotation is not None:
            if has_annotation:
                conditions.append("a.rsid IS NOT NULL")
            else:
                conditions.append("a.rsid IS NULL")

        if gene:
            conditions.append("a.gene LIKE ?")
            params.append(f"%{gene}%")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY a.magnitude DESC NULLS LAST LIMIT ?"
        params.append(limit)

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                r["categories"] = json.loads(r["categories"]) if r.get("categories") else []
                r["genotype_info"] = json.loads(r["genotype_info"]) if r.get("genotype_info") else {}
                r["references"] = json.loads(r["ref_urls"]) if r.get("ref_urls") else []
                r.pop("ref_urls", None)
                results.append(r)
            return results


# ============== SNPedia Cache Functions ==============

async def cache_snpedia_page(page_name: str, wikitext: str, categories: list[str] = None):
    """Cache a SNPedia page locally."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO snpedia_cache (page_name, wikitext, categories, fetched_at)
            VALUES (?, ?, ?, ?)
        """, (
            page_name.lower(),
            wikitext,
            json.dumps(categories or []),
            datetime.now().isoformat()
        ))
        await db.commit()


async def get_cached_snpedia_page(page_name: str) -> Optional[dict]:
    """Get a cached SNPedia page."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM snpedia_cache WHERE page_name = ?",
            (page_name.lower(),)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                r = dict(row)
                r["categories"] = json.loads(r["categories"]) if r["categories"] else []
                return r
            return None


async def get_all_cached_pages() -> list[dict]:
    """Get all cached SNPedia pages."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT page_name, fetched_at FROM snpedia_cache") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def get_snpedia_cache_stats() -> dict:
    """Get statistics about the SNPedia cache."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM snpedia_cache") as cursor:
            total = (await cursor.fetchone())[0]

        async with db.execute("SELECT COUNT(*) FROM snpedia_cache WHERE page_name LIKE 'rs%' AND page_name NOT LIKE '%(%'") as cursor:
            main_pages = (await cursor.fetchone())[0]

        async with db.execute("SELECT COUNT(*) FROM snpedia_cache WHERE page_name LIKE '%(%'") as cursor:
            genotype_pages = (await cursor.fetchone())[0]

        return {
            "total_pages": total,
            "main_pages": main_pages,
            "genotype_pages": genotype_pages
        }


# ============== Unified Data Logging ==============

async def log_data(
    source: str,
    data_type: str,
    content: str,
    reference_id: str = None,
    metadata: dict = None
) -> int:
    """
    Log any data ingestion to the unified data log.

    Sources: 'snpedia', 'claude', 'user', 'system'
    Data types: 'page', 'annotation', 'conversation', 'interpretation', 'query', 'genotype_page'
    """
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("""
            INSERT INTO data_log (source, data_type, reference_id, content, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            source,
            data_type,
            reference_id,
            content,
            json.dumps(metadata) if metadata else None,
            datetime.now().isoformat()
        ))
        await db.commit()
        return cursor.lastrowid


async def get_data_log(
    source: str = None,
    data_type: str = None,
    reference_id: str = None,
    limit: int = 100
) -> list[dict]:
    """Query the data log with filters."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        conditions = []
        params = []

        if source:
            conditions.append("source = ?")
            params.append(source)
        if data_type:
            conditions.append("data_type = ?")
            params.append(data_type)
        if reference_id:
            conditions.append("reference_id = ?")
            params.append(reference_id)

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
        query = f"SELECT * FROM data_log {where_clause} ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                r["metadata"] = json.loads(r["metadata"]) if r.get("metadata") else None
                results.append(r)
            return results


async def get_data_log_stats() -> dict:
    """Get statistics about all logged data."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        stats = {"by_source": {}, "by_type": {}, "total": 0}

        async with db.execute("SELECT COUNT(*) FROM data_log") as cursor:
            stats["total"] = (await cursor.fetchone())[0]

        async with db.execute("SELECT source, COUNT(*) FROM data_log GROUP BY source") as cursor:
            rows = await cursor.fetchall()
            stats["by_source"] = {row[0]: row[1] for row in rows}

        async with db.execute("SELECT data_type, COUNT(*) FROM data_log GROUP BY data_type") as cursor:
            rows = await cursor.fetchall()
            stats["by_type"] = {row[0]: row[1] for row in rows}

        return stats


# ============ Genotype Labels ============

async def set_genotype_label(
    rsid: str,
    label: str,
    confidence: str = None,
    population_frequency: float = None,
    notes: str = None,
    source: str = "claude"
) -> None:
    """Set or update a genotype label for an SNP."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        now = datetime.now().isoformat()
        await db.execute("""
            INSERT INTO genotype_labels (rsid, label, confidence, population_frequency, notes, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(rsid) DO UPDATE SET
                label = excluded.label,
                confidence = excluded.confidence,
                population_frequency = excluded.population_frequency,
                notes = excluded.notes,
                source = excluded.source,
                updated_at = excluded.updated_at
        """, (rsid, label, confidence, population_frequency, notes, source, now, now))
        await db.commit()


async def get_genotype_label(rsid: str) -> Optional[dict]:
    """Get the genotype label for an SNP."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM genotype_labels WHERE rsid = ?", (rsid,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_genotype_labels_batch(rsids: list[str]) -> dict[str, dict]:
    """Get genotype labels for multiple SNPs."""
    if not rsids:
        return {}

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        placeholders = ",".join("?" * len(rsids))
        query = f"SELECT * FROM genotype_labels WHERE rsid IN ({placeholders})"
        async with db.execute(query, rsids) as cursor:
            rows = await cursor.fetchall()
            return {row["rsid"]: dict(row) for row in rows}


async def search_snps_by_label(
    label: str,
    limit: int = 50,
    offset: int = 0
) -> tuple[list[dict], int]:
    """Search SNPs by genotype label (normal, abnormal, rare, etc.)."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Get total count
        async with db.execute(
            "SELECT COUNT(*) FROM genotype_labels WHERE label = ?",
            (label,)
        ) as cursor:
            total = (await cursor.fetchone())[0]

        # Get results with SNP and annotation data
        query = """
            SELECT s.*, a.summary, a.magnitude, a.repute, a.gene, a.categories,
                   gl.label, gl.confidence, gl.population_frequency, gl.notes as label_notes
            FROM genotype_labels gl
            JOIN snps s ON gl.rsid = s.rsid
            LEFT JOIN annotations a ON gl.rsid = a.rsid
            WHERE gl.label = ?
            ORDER BY a.magnitude DESC NULLS LAST
            LIMIT ? OFFSET ?
        """
        async with db.execute(query, (label, limit, offset)) as cursor:
            rows = await cursor.fetchall()
            results = []
            for row in rows:
                r = dict(row)
                r["categories"] = json.loads(r["categories"]) if r.get("categories") else []
                results.append(r)
            return results, total


async def get_all_labels() -> list[dict]:
    """Get all unique labels with counts."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        query = """
            SELECT label, COUNT(*) as count
            FROM genotype_labels
            GROUP BY label
            ORDER BY count DESC
        """
        async with db.execute(query) as cursor:
            rows = await cursor.fetchall()
            return [{"label": row[0], "count": row[1]} for row in rows]


async def delete_genotype_label(rsid: str) -> bool:
    """Delete a genotype label."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("DELETE FROM genotype_labels WHERE rsid = ?", (rsid,))
        await db.commit()
        return cursor.rowcount > 0
