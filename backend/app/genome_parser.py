import asyncio
from pathlib import Path
from typing import Optional
from . import database


async def parse_23andme_file(file_path: Path) -> int:
    """
    Parse a 23andMe genome file and load it into the database.
    Returns the number of SNPs loaded.
    """
    snps = []
    batch_size = 10000
    total_count = 0

    with open(file_path, "r") as f:
        for line in f:
            # Skip comment lines
            if line.startswith("#"):
                continue

            parts = line.strip().split("\t")
            if len(parts) != 4:
                continue

            rsid, chromosome, position, genotype = parts

            # Skip entries with no genotype call
            if genotype == "--":
                continue

            try:
                snps.append({
                    "rsid": rsid,
                    "chromosome": chromosome,
                    "position": int(position),
                    "genotype": genotype
                })
            except ValueError:
                continue

            # Batch insert
            if len(snps) >= batch_size:
                await database.insert_snps(snps)
                total_count += len(snps)
                snps = []

    # Insert remaining SNPs
    if snps:
        await database.insert_snps(snps)
        total_count += len(snps)

    return total_count


async def find_genome_file(directory: Path) -> Optional[Path]:
    """Find the 23andMe genome file in the given directory."""
    for pattern in ["genome_*.txt", "*.txt"]:
        files = list(directory.glob(pattern))
        for f in files:
            # Check if it looks like a 23andMe file
            with open(f, "r") as fp:
                first_lines = [fp.readline() for _ in range(30)]
                content = "".join(first_lines)
                if "23andMe" in content or "rsid\tchromosome" in content.lower():
                    return f
    return None
