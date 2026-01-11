import json
import csv
import io
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from .. import database

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("")
async def export_data(
    format: str = Query("json", description="Export format: json or csv"),
    annotated_only: bool = Query(True, description="Only export annotated SNPs"),
    favorites_only: bool = Query(False, description="Only export favorites")
):
    """Export SNP data with annotations."""

    # Get all relevant SNPs
    if favorites_only:
        results, _ = await database.search_snps(favorites_only=True, limit=10000)
    elif annotated_only:
        results, _ = await database.search_snps(min_magnitude=0, limit=10000)
    else:
        results, _ = await database.search_snps(limit=50000)

    if format == "csv":
        return export_csv(results)
    else:
        return export_json(results)


def export_json(results: list[dict]):
    """Export as JSON."""
    # Clean up the data for export
    export_data = []
    for r in results:
        export_data.append({
            "rsid": r["rsid"],
            "chromosome": r["chromosome"],
            "position": r["position"],
            "genotype": r["genotype"],
            "gene": r.get("gene"),
            "summary": r.get("summary"),
            "magnitude": r.get("magnitude"),
            "repute": r.get("repute"),
            "categories": r.get("categories", []),
            "genotype_interpretation": r.get("genotype_info", {}).get(r["genotype"], ""),
            "references": r.get("references", [])
        })

    content = json.dumps(export_data, indent=2)

    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=genome_export.json"}
    )


def export_csv(results: list[dict]):
    """Export as CSV."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "rsid", "chromosome", "position", "genotype", "gene",
        "summary", "magnitude", "repute", "categories", "interpretation"
    ])

    for r in results:
        writer.writerow([
            r["rsid"],
            r["chromosome"],
            r["position"],
            r["genotype"],
            r.get("gene", ""),
            r.get("summary", ""),
            r.get("magnitude", ""),
            r.get("repute", ""),
            ";".join(r.get("categories", [])),
            r.get("genotype_info", {}).get(r["genotype"], "")
        ])

    output.seek(0)

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=genome_export.csv"}
    )
