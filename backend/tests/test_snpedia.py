"""
Test suite for SNPedia parsing.

Tests use downloaded fixture files to verify parsing logic without hitting the API.
Run: pytest tests/test_snpedia.py -v
"""
import json
import pytest
from pathlib import Path
import sys

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.snpedia import (
    parse_wikitext,
    extract_summary,
    extract_genotype_summary,
    map_categories,
    complement_genotype,
    get_genotype_interpretation,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(filename: str) -> dict:
    """Load a JSON fixture file."""
    filepath = FIXTURES_DIR / filename
    with open(filepath) as f:
        return json.load(f)


class TestParseMainPage:
    """Test parsing of main SNP pages."""

    def test_rs1801133_mthfr(self):
        """Test parsing MTHFR rs1801133 - well-documented SNP."""
        data = load_fixture("rs1801133_main.json")
        wikitext = data["parse"]["wikitext"]["*"]
        categories = [c["*"] for c in data["parse"].get("categories", [])]

        result = parse_wikitext("rs1801133", wikitext, categories)

        assert result["gene"] == "MTHFR"
        assert result["summary"] is not None
        assert len(result["summary"]) > 20

    def test_rs429358_apoe(self):
        """Test parsing APOE rs429358."""
        data = load_fixture("rs429358_main.json")
        wikitext = data["parse"]["wikitext"]["*"]
        categories = [c["*"] for c in data["parse"].get("categories", [])]

        result = parse_wikitext("rs429358", wikitext, categories)

        assert result["gene"] == "APOE"

    def test_rs4680_comt(self):
        """Test parsing COMT rs4680 (warrior/worrier gene)."""
        data = load_fixture("rs4680_main.json")
        wikitext = data["parse"]["wikitext"]["*"]
        categories = [c["*"] for c in data["parse"].get("categories", [])]

        result = parse_wikitext("rs4680", wikitext, categories)

        assert result["gene"] == "COMT"


class TestParseGenotypePage:
    """Test parsing of genotype-specific pages."""

    def test_rs1801133_cc(self):
        """Test parsing rs1801133(C;C) - normal genotype."""
        data = load_fixture("Rs1801133_C_C_.json")
        wikitext = data["parse"]["wikitext"]["*"]

        summary = extract_genotype_summary(wikitext)

        assert summary is not None
        assert "normal" in summary.lower() or "common" in summary.lower()

    def test_rs1801133_tt(self):
        """Test parsing rs1801133(T;T) - homozygous variant."""
        data = load_fixture("Rs1801133_T_T_.json")
        wikitext = data["parse"]["wikitext"]["*"]

        summary = extract_genotype_summary(wikitext)

        assert summary is not None
        # TT is the "bad" variant for MTHFR
        assert len(summary) > 10

    def test_rs4680_aa(self):
        """Test parsing rs4680(A;A) - worrier genotype."""
        data = load_fixture("Rs4680_A_A_.json")
        wikitext = data["parse"]["wikitext"]["*"]

        summary = extract_genotype_summary(wikitext)

        assert summary is not None

    def test_rs4680_gg(self):
        """Test parsing rs4680(G;G) - warrior genotype."""
        data = load_fixture("Rs4680_G_G_.json")
        wikitext = data["parse"]["wikitext"]["*"]

        summary = extract_genotype_summary(wikitext)

        assert summary is not None


class TestMagnitudeRepute:
    """Test extraction of magnitude and repute from genotype pages."""

    def test_extract_magnitude(self):
        """Test magnitude extraction from genotype wikitext."""
        # Magnitude is in the genotype template
        data = load_fixture("Rs1801133_C_C_.json")
        wikitext = data["parse"]["wikitext"]["*"]

        import re
        mag_match = re.search(r"\|magnitude\s*=\s*([\d.]+)", wikitext, re.IGNORECASE)

        assert mag_match is not None
        magnitude = float(mag_match.group(1))
        assert magnitude >= 0

    def test_extract_repute(self):
        """Test repute extraction from genotype wikitext."""
        data = load_fixture("Rs1801133_C_C_.json")
        wikitext = data["parse"]["wikitext"]["*"]

        import re
        repute_match = re.search(r"\|repute\s*=\s*(\w+)", wikitext, re.IGNORECASE)

        assert repute_match is not None
        repute = repute_match.group(1).lower()
        assert repute in ["good", "bad", "neutral"]


class TestPerGenotypeData:
    """Test capturing complete per-genotype data (like SNPedia genotype tables).

    SNPedia shows tables like:
    | Genotype | Magnitude | Summary                    |
    | (G;G)    | 0         | normal                     |
    | (G;T)    | 2.5       | 2.7x risk for X            |
    | (T;T)    | 3.5       | 8.2x risk for X            |

    This tests we capture all three fields per genotype.
    """

    def test_rs1801133_all_genotypes_captured(self):
        """Verify all genotype variants have magnitude, repute, summary."""
        import re

        # CC - normal
        cc_data = load_fixture("Rs1801133_C_C_.json")
        cc_wikitext = cc_data["parse"]["wikitext"]["*"]

        cc_mag = re.search(r"\|magnitude\s*=\s*([\d.]+)", cc_wikitext, re.IGNORECASE)
        cc_repute = re.search(r"\|repute\s*=\s*(\w+)", cc_wikitext, re.IGNORECASE)
        cc_summary = extract_genotype_summary(cc_wikitext)

        assert cc_mag is not None
        assert float(cc_mag.group(1)) == 0
        assert cc_repute.group(1).lower() == "good"
        assert cc_summary is not None
        assert "normal" in cc_summary.lower()

        # TT - risk variant
        tt_data = load_fixture("Rs1801133_T_T_.json")
        tt_wikitext = tt_data["parse"]["wikitext"]["*"]

        tt_mag = re.search(r"\|magnitude\s*=\s*([\d.]+)", tt_wikitext, re.IGNORECASE)
        tt_repute = re.search(r"\|repute\s*=\s*(\w+)", tt_wikitext, re.IGNORECASE)
        tt_summary = extract_genotype_summary(tt_wikitext)

        assert tt_mag is not None
        assert float(tt_mag.group(1)) == 2.8  # Higher magnitude = more significant
        assert tt_repute.group(1).lower() == "bad"
        assert tt_summary is not None
        assert len(tt_summary) > 20

    def test_rs4680_warrior_worrier_genotypes(self):
        """Verify COMT warrior/worrier genotype data is captured."""
        import re

        # GG - warrior
        gg_data = load_fixture("Rs4680_G_G_.json")
        gg_wikitext = gg_data["parse"]["wikitext"]["*"]

        gg_mag = re.search(r"\|magnitude\s*=\s*([\d.]+)", gg_wikitext, re.IGNORECASE)
        gg_summary = extract_genotype_summary(gg_wikitext)

        assert gg_mag is not None
        assert float(gg_mag.group(1)) == 2.5
        assert gg_summary is not None
        assert "warrior" in gg_summary.lower()

        # AA - worrier
        aa_data = load_fixture("Rs4680_A_A_.json")
        aa_wikitext = aa_data["parse"]["wikitext"]["*"]

        aa_mag = re.search(r"\|magnitude\s*=\s*([\d.]+)", aa_wikitext, re.IGNORECASE)
        aa_summary = extract_genotype_summary(aa_wikitext)

        assert aa_mag is not None
        assert float(aa_mag.group(1)) == 2.5
        assert aa_summary is not None
        assert "worrier" in aa_summary.lower()

        # AG - intermediate (may not have magnitude)
        ag_data = load_fixture("Rs4680_A_G_.json")
        ag_wikitext = ag_data["parse"]["wikitext"]["*"]

        ag_summary = extract_genotype_summary(ag_wikitext)
        assert ag_summary is not None
        assert "intermediate" in ag_summary.lower()

    def test_genotype_table_data_structure(self):
        """Simulate building a complete genotype table from fixtures."""
        import re

        genotype_table = {}
        fixtures = ["Rs1801133_C_C_.json", "Rs1801133_T_T_.json"]

        for fixture_name in fixtures:
            data = load_fixture(fixture_name)
            wikitext = data["parse"]["wikitext"]["*"]

            # Extract alleles from title (Rs1801133(C;C) -> CC)
            title = data["parse"]["title"]
            allele_match = re.search(r"\((\w);(\w)\)", title)
            if allele_match:
                genotype = allele_match.group(1) + allele_match.group(2)
            else:
                continue

            # Extract all fields
            mag_match = re.search(r"\|magnitude\s*=\s*([\d.]+)", wikitext, re.IGNORECASE)
            repute_match = re.search(r"\|repute\s*=\s*(\w+)", wikitext, re.IGNORECASE)
            summary = extract_genotype_summary(wikitext)

            genotype_table[genotype] = {
                "magnitude": float(mag_match.group(1)) if mag_match else None,
                "repute": repute_match.group(1).lower() if repute_match else None,
                "summary": summary
            }

        # Verify we built a complete table
        assert "CC" in genotype_table
        assert "TT" in genotype_table

        # CC should be the "good" variant
        assert genotype_table["CC"]["magnitude"] == 0
        assert genotype_table["CC"]["repute"] == "good"

        # TT should be the "bad" variant with higher magnitude
        assert genotype_table["TT"]["magnitude"] > genotype_table["CC"]["magnitude"]
        assert genotype_table["TT"]["repute"] == "bad"


class TestComplementGenotype:
    """Test DNA strand complement functionality."""

    def test_complement_cc(self):
        assert complement_genotype("CC") == "GG"

    def test_complement_ag(self):
        assert complement_genotype("AG") == "TC"

    def test_complement_at(self):
        assert complement_genotype("AT") == "TA"

    def test_complement_gc(self):
        assert complement_genotype("GC") == "CG"


class TestGenotypeInterpretation:
    """Test genotype interpretation with strand handling."""

    def test_direct_match(self):
        genotype_info = {"AA": "normal", "AG": "carrier", "GG": "risk"}
        interp, matched = get_genotype_interpretation(genotype_info, "AG")
        assert interp == "carrier"
        assert matched == "AG"

    def test_reversed_match(self):
        genotype_info = {"AA": "normal", "AG": "carrier", "GG": "risk"}
        interp, matched = get_genotype_interpretation(genotype_info, "GA")
        assert interp == "carrier"
        assert matched == "AG"

    def test_complement_match(self):
        """Test matching opposite strand (C/G are complements)."""
        genotype_info = {"CC": "normal", "CG": "carrier", "GG": "risk"}
        # User has GG on opposite strand = CC
        interp, matched = get_genotype_interpretation(genotype_info, "GG")
        assert interp == "risk"
        assert matched == "GG"

    def test_no_match(self):
        genotype_info = {"AA": "normal", "AG": "carrier", "GG": "risk"}
        interp, matched = get_genotype_interpretation(genotype_info, "CC")
        # CC complements to GG, which exists
        assert interp == "risk"


class TestCategoryMapping:
    """Test SNPedia category to our category mapping."""

    def test_health_categories(self):
        wiki_cats = ["Is a medical condition", "Cancer risk"]
        result = map_categories(wiki_cats)
        assert "health" in result

    def test_trait_categories(self):
        wiki_cats = ["Physical traits", "Eye color"]
        result = map_categories(wiki_cats)
        assert "traits" in result

    def test_ancestry_categories(self):
        wiki_cats = ["Population genetics", "Haplogroup markers"]
        result = map_categories(wiki_cats)
        assert "ancestry" in result

    def test_multiple_categories(self):
        wiki_cats = ["Medical condition", "Population genetics"]
        result = map_categories(wiki_cats)
        assert "health" in result
        assert "ancestry" in result


class TestExtractSummary:
    """Test summary extraction from wikitext."""

    def test_skip_redirect(self):
        wikitext = "#REDIRECT [[rs12345]]"
        result = extract_summary(wikitext)
        assert result is None

    def test_extract_from_template(self):
        wikitext = "{{Template|param=value}}\nThis is a real summary about the SNP."
        result = extract_summary(wikitext)
        assert result is not None
        assert "summary" in result.lower()

    def test_remove_wiki_links(self):
        wikitext = "This [[gene|GENE]] is associated with [[disease]]."
        result = extract_summary(wikitext)
        assert "[[" not in result
        assert "GENE" in result or "gene" in result


# Integration test - requires actual fixture data
class TestRealFixtures:
    """Tests that verify fixture data matches expected SNPedia structure."""

    def test_all_main_fixtures_parse(self):
        """Ensure all main page fixtures parse without error."""
        main_files = list(FIXTURES_DIR.glob("*_main.json"))
        assert len(main_files) >= 5, "Expected at least 5 main page fixtures"

        for filepath in main_files:
            data = json.loads(filepath.read_text())
            assert "parse" in data
            assert "wikitext" in data["parse"]
            wikitext = data["parse"]["wikitext"]["*"]
            assert len(wikitext) > 50

    def test_all_genotype_fixtures_parse(self):
        """Ensure all genotype page fixtures parse without error."""
        geno_files = [f for f in FIXTURES_DIR.glob("Rs*.json") if "_main" not in f.name]
        assert len(geno_files) >= 6, "Expected at least 6 genotype page fixtures"

        for filepath in geno_files:
            data = json.loads(filepath.read_text())
            assert "parse" in data
            wikitext = data["parse"]["wikitext"]["*"]
            # Genotype pages have the Genotype template
            assert "Genotype" in wikitext or "genotype" in wikitext.lower()
