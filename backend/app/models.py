from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SNP(BaseModel):
    rsid: str
    chromosome: str
    position: int
    genotype: str


class Annotation(BaseModel):
    rsid: str
    summary: Optional[str] = None
    magnitude: Optional[float] = None
    repute: Optional[str] = None  # "good", "bad", or "neutral"
    gene: Optional[str] = None
    categories: list[str] = []
    genotype_info: dict[str, str] = {}
    references: list[str] = []
    fetched_at: Optional[datetime] = None


class SNPWithAnnotation(BaseModel):
    rsid: str
    chromosome: str
    position: int
    genotype: str
    summary: Optional[str] = None
    magnitude: Optional[float] = None
    repute: Optional[str] = None
    gene: Optional[str] = None
    categories: list[str] = []
    genotype_info: dict[str, str] = {}
    references: list[str] = []
    is_favorite: bool = False
    has_annotation: bool = False


class Category(BaseModel):
    id: str
    name: str
    description: str
    count: int = 0


class SyncStatus(BaseModel):
    total_snps: int
    annotated_snps: int
    is_syncing: bool
    current_batch: Optional[str] = None


class DashboardData(BaseModel):
    notable_variants: list[SNPWithAnnotation]
    category_counts: dict[str, int]
    total_snps: int
    annotated_snps: int
