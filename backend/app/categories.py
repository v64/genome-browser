"""
Curated lists of well-known SNPs organized by category.
These are prioritized for fetching annotations on first load.
"""

CATEGORIES = {
    "health": {
        "name": "Health & Medical",
        "description": "Disease risks, drug metabolism, and medical conditions",
        "snps": [
            # Alzheimer's / APOE
            "rs429358", "rs7412",
            # Cardiovascular
            "rs1801133", "rs1801131",  # MTHFR
            "rs6025",  # Factor V Leiden
            "rs1799963",  # Prothrombin
            "rs1800790",  # Fibrinogen
            "rs1799983",  # eNOS
            "rs5186",  # AGTR1
            # Cancer risk
            "rs1799950", "rs1799949", "rs1800056",  # BRCA1
            "rs144848", "rs766173",  # BRCA2
            "rs1042522",  # TP53
            "rs1800566",  # NQO1
            # Diabetes
            "rs7903146",  # TCF7L2
            "rs1801282",  # PPARG
            "rs5219",  # KCNJ11
            "rs13266634",  # SLC30A8
            # Drug metabolism - CYP450
            "rs1065852", "rs3892097",  # CYP2D6
            "rs4244285", "rs4986893",  # CYP2C19
            "rs1057910",  # CYP2C9
            "rs776746",  # CYP3A5
            # Warfarin sensitivity
            "rs9923231",  # VKORC1
            # Statins
            "rs4149056",  # SLCO1B1
            # Autoimmune
            "rs2476601",  # PTPN22
            "rs3087243",  # CTLA4
            # Celiac
            "rs2187668",  # HLA-DQ2.5
            # Hemochromatosis
            "rs1800562", "rs1799945",  # HFE
            # Alpha-1 antitrypsin
            "rs28929474",  # SERPINA1
            # Cystic fibrosis carrier
            "rs113993960",  # CFTR delta F508
            # Age-related macular degeneration
            "rs1061170",  # CFH
            "rs10490924",  # ARMS2
            # Parkinson's
            "rs34637584",  # LRRK2
            # Migraine
            "rs1835740",
        ]
    },
    "traits": {
        "name": "Physical Traits",
        "description": "Eye color, hair, taste, metabolism, and other physical characteristics",
        "snps": [
            # Eye color
            "rs12913832",  # HERC2 - blue/brown eyes
            "rs1800407",  # OCA2
            "rs12896399",  # SLC24A4
            "rs16891982",  # SLC45A2
            "rs1426654",  # SLC24A5 - skin pigmentation
            # Hair color
            "rs1805007", "rs1805008", "rs1805009",  # MC1R - red hair
            "rs12821256",  # KITLG - blonde hair
            "rs4778138",  # OCA2 - hair color
            # Hair texture/balding
            "rs1385699",  # curly hair
            "rs6152",  # androgen receptor - male pattern baldness
            # Skin
            "rs1805005",  # MC1R - freckling
            "rs2228479",  # MC1R
            # Earwax type
            "rs17822931",  # ABCC11
            # Taste
            "rs713598", "rs1726866", "rs10246939",  # TAS2R38 - bitter taste (cilantro, etc)
            "rs4481887",  # asparagus smell detection
            # Metabolism
            "rs4988235",  # LCT - lactose tolerance
            "rs671",  # ALDH2 - alcohol flush
            "rs1229984",  # ADH1B - alcohol metabolism
            "rs762551",  # CYP1A2 - caffeine metabolism
            "rs1800497",  # ANKK1/DRD2 - dopamine, addictive behavior
            # Muscle
            "rs1815739",  # ACTN3 - sprint/power athlete
            # Sleep
            "rs57875989",  # DEC2 - short sleeper
            # Pain sensitivity
            "rs6746030",  # SCN9A
            # Sneezing
            "rs10427255",  # photic sneeze reflex
            # Cilantro taste
            "rs72921001",  # OR6A2 - cilantro soapy taste
        ]
    },
    "intelligence": {
        "name": "Cognitive & Neurological",
        "description": "Memory, learning, neuroplasticity, and cognitive traits",
        "snps": [
            # Memory
            "rs17070145",  # KIBRA - episodic memory
            "rs6265",  # BDNF Val66Met - neuroplasticity, memory
            # Executive function
            "rs4680",  # COMT Val158Met - dopamine, "warrior vs worrier"
            "rs4633",  # COMT
            # Dopamine
            "rs1800497",  # DRD2/ANKK1 - dopamine receptors
            "rs1800955",  # DRD4 - novelty seeking
            # Serotonin
            "rs25531",  # SLC6A4 - serotonin transporter
            # Educational attainment GWAS hits
            "rs9320913",
            "rs11584700",
            "rs4851266",
            "rs2721173",
            # Intelligence-associated
            "rs363050",  # SNAP25
            "rs17571",  # CTSD
            # Creativity/openness
            "rs1800955",  # DRD4
            # ADHD-associated
            "rs5574",  # DAT1
            "rs27072",  # DAT1
            # Anxiety/stress response
            "rs53576",  # OXTR - oxytocin receptor, empathy
            "rs6311",  # HTR2A
            # Circadian rhythm / chronotype
            "rs57875989",  # DEC2
            "rs12927162",  # CLOCK
        ]
    },
    "ancestry": {
        "name": "Ancestry & Population",
        "description": "Population-specific markers and ancestry indicators",
        "snps": [
            # Skin/hair pigmentation markers with population frequency differences
            "rs1426654",  # SLC24A5 - European light skin
            "rs16891982",  # SLC45A2 - European
            "rs885479",  # MC1R
            # Lactase persistence (population-specific)
            "rs4988235",  # European lactase persistence
            "rs145946881",  # East African lactase persistence
            # Alcohol metabolism (East Asian)
            "rs671",  # ALDH2 - Asian flush
            # Dry earwax (East Asian)
            "rs17822931",
            # Malaria resistance
            "rs334",  # HBB - sickle cell
            "rs5743810",  # TLR1
            # High altitude adaptation
            "rs11689011",  # EGLN1 - Tibetan
            # Blood type
            "rs8176719",  # ABO
            "rs8176746",  # ABO
            # Disease resistance markers
            "rs333",  # CCR5-delta32 - HIV resistance
        ]
    }
}


def get_all_priority_snps() -> list[str]:
    """Get all SNPs from all categories for priority fetching."""
    all_snps = []
    for category in CATEGORIES.values():
        all_snps.extend(category["snps"])
    return list(set(all_snps))  # Remove duplicates


def get_category_snps(category_id: str) -> list[str]:
    """Get SNPs for a specific category."""
    if category_id in CATEGORIES:
        return CATEGORIES[category_id]["snps"]
    return []


def get_category_info() -> list[dict]:
    """Get category metadata."""
    return [
        {"id": cat_id, "name": cat["name"], "description": cat["description"]}
        for cat_id, cat in CATEGORIES.items()
    ]
