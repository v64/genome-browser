import asyncio
import os
from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import database
from .genome_parser import parse_23andme_file, find_genome_file
from .categories import get_all_priority_snps
from . import snpedia, claude_service

from .routers import snps, categories, sync, favorites, export, chat, knowledge, annotations, search, agent

# Load environment variables from .env file
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and load genome on startup."""
    print("Initializing database...")
    await database.init_db()

    # Check if we need to load the genome file
    snp_count = await database.get_snp_count()

    if snp_count == 0:
        print("Loading genome file...")
        # Look for genome file in parent directory
        genome_dir = Path(__file__).parent.parent.parent
        genome_file = await find_genome_file(genome_dir)

        if genome_file:
            print(f"Found genome file: {genome_file}")
            count = await parse_23andme_file(genome_file)
            print(f"Loaded {count:,} SNPs")
        else:
            print("No genome file found. Please place your 23andMe file in the project directory.")
    else:
        print(f"Database contains {snp_count:,} SNPs")

    # Start background sync for priority SNPs
    asyncio.create_task(initial_sync())

    yield

    print("Shutting down...")


async def initial_sync():
    """Fetch annotations for priority SNPs on startup."""
    await asyncio.sleep(2)  # Give the server time to start

    priority_snps = get_all_priority_snps()
    to_fetch = await database.get_unannotated_rsids(priority_snps)

    if to_fetch:
        print(f"Fetching annotations for {len(to_fetch)} priority SNPs...")
        for i, rsid in enumerate(to_fetch):
            await snpedia.fetch_snp_info(rsid)
            if (i + 1) % 10 == 0:
                print(f"  Fetched {i + 1}/{len(to_fetch)} annotations...")
        print("Priority sync complete!")


app = FastAPI(
    title="Genome Browser",
    description="Personal genome browser with SNPedia annotations",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend (multiple ports in case of conflicts)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:5175", "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(snps.router)
app.include_router(categories.router)
app.include_router(sync.router)
app.include_router(favorites.router)
app.include_router(export.router)
app.include_router(chat.router)
app.include_router(knowledge.router)
app.include_router(annotations.router)
app.include_router(search.router)
app.include_router(agent.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    snp_count = await database.get_snp_count()
    annotation_count = await database.get_annotation_count()

    return {
        "status": "healthy",
        "snp_count": snp_count,
        "annotation_count": annotation_count,
        "claude_configured": claude_service.is_configured()
    }
