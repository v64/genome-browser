import os
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from .. import database, claude_service
from ..genome_parser import parse_23andme_file

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ApiKeyRequest(BaseModel):
    api_key: str


@router.get("/api-key")
async def check_api_key():
    """Check if Claude API key is configured. Never returns the actual key."""
    return {
        "configured": claude_service.is_configured(),
        "source": "environment" if os.getenv("ANTHROPIC_API_KEY") else "database"
    }


@router.post("/api-key")
async def set_api_key(request: ApiKeyRequest):
    """Set the Claude API key (stores in database)."""
    if not request.api_key or not request.api_key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")

    api_key = request.api_key.strip()

    # Basic validation - Anthropic keys start with sk-ant-
    if not api_key.startswith("sk-ant-"):
        raise HTTPException(
            status_code=400,
            detail="Invalid API key format. Anthropic keys start with 'sk-ant-'"
        )

    # Store in database
    await database.set_setting("anthropic_api_key", api_key)

    # Reset the client to pick up the new key
    claude_service.reset_client()

    return {
        "success": True,
        "message": "API key saved successfully"
    }


@router.delete("/api-key")
async def delete_api_key():
    """Remove the stored API key from database."""
    deleted = await database.delete_setting("anthropic_api_key")

    # Reset the client
    claude_service.reset_client()

    return {
        "success": True,
        "deleted": deleted,
        "message": "API key removed" if deleted else "No stored API key found"
    }


@router.get("/genome")
async def check_genome():
    """Check if genome data is loaded."""
    snp_count = await database.get_snp_count()
    return {
        "loaded": snp_count > 0,
        "snp_count": snp_count
    }


@router.post("/genome")
async def upload_genome(file: UploadFile = File(...)):
    """Upload and parse a 23andMe genome file."""
    # Check if genome is already loaded
    existing_count = await database.get_snp_count()
    if existing_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Genome data already loaded ({existing_count:,} SNPs). Delete existing data first."
        )

    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Read and validate content
    content = await file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be a text file")

    # Check if it looks like a 23andMe file
    first_lines = text[:2000]
    if "23andMe" not in first_lines and "rsid\tchromosome" not in first_lines.lower():
        raise HTTPException(
            status_code=400,
            detail="File doesn't appear to be a 23andMe genome file. Expected header with '23andMe' or 'rsid' columns."
        )

    # Save to temp file and parse
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp:
            tmp.write(text)
            tmp_path = Path(tmp.name)

        snp_count = await parse_23andme_file(tmp_path)

        # Clean up temp file
        tmp_path.unlink()

        return {
            "success": True,
            "snp_count": snp_count,
            "message": f"Successfully loaded {snp_count:,} SNPs"
        }

    except Exception as e:
        # Clean up on error
        if 'tmp_path' in locals():
            try:
                tmp_path.unlink()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Failed to parse genome file: {str(e)}")
