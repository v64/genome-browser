# Genome Browser

A personal genome exploration tool that combines your 23andMe genetic data with Claude AI to help you understand your DNA. Browse your SNPs, get AI-powered interpretations, and build a growing knowledge base about your genetic variants.

![Dashboard](screenshots/1.1-main-dashboard.png)

## Features

### Dashboard

The dashboard gives you an at-a-glance overview of your genome exploration progress:

- **Stats**: See your total SNPs, annotations from SNPedia, Claude-generated annotations, and total knowledge entries
- **Most Interesting Genes**: Automatically curated list of your most significant genetic variants based on magnitude, research interest, and activity
- **Needs Attention**: High-impact genes that haven't been annotated yet, with one-click annotation

![Needs Attention](screenshots/1.3-gene-needs-attention.png)

The "Needs Attention" section highlights important variants that could use Claude's annotation. Click any card to start the annotation process automatically.

### Export Your Data

Export your genome data and annotations in multiple formats:

![Export Options](screenshots/1.2-export-dropdown.png)

- **Annotated SNPs (JSON/CSV)**: Export only SNPs with research data
- **Favorites Only**: Export just your starred SNPs
- **All SNPs**: Complete genome export

---

## Query Your Genome

The Query tab lets you ask natural language questions about your DNA. Claude searches your genome, finds relevant SNPs, looks up your genotypes, and provides personalized interpretations.

![Query Page](screenshots/2.1-query.png)

Type any question or use the suggested prompts:
- "What are my most significant genetic variants?"
- "Do I have any risk variants for common diseases?"
- "What genes affect my metabolism?"
- "Tell me about my ancestry-related SNPs"

### Query Processing

When you submit a query, Claude analyzes your genome in real-time:

![Querying](screenshots/2.2-querying.png)

You can switch tabs while waiting - your results will be ready when you return.

### Personalized Results

Claude returns detailed, personalized analysis based on your actual genotypes:

![Query Summary 1](screenshots/2.3-query-summary1.png)

Results include specific interpretations for your variants, with confidence levels and scientific context.

![Query Summary 2](screenshots/2.4-query-summary2.png)

Each response covers multiple aspects - from direct trait predictions to ancestry indicators and interesting bonus findings.

### Gene Cards with References

Below the summary, you'll see cards for each relevant gene mentioned in the response:

![Gene Cards](screenshots/2.5-query-gene-card-references.png)

Each card shows:
- RS number and gene name
- Your genotype
- Magnitude score (importance)
- Categories and tags
- Clickable citations to scientific sources

### Sidebar Quick View

Click any gene card to open the sidebar with more details:

![Sidebar View](screenshots/2.6-sidebar-view.png)

The sidebar shows:
- Gene summary
- Your genotype interpretation
- Categories
- Quick actions: View Full Page, Ask Claude, View on SNPedia

---

## Gene Detail Page

Click "View Full Page" to see the complete gene profile:

![Gene Main Page](screenshots/2.7-gene-main-page.png)

The full page includes:
- Complete summary with inline citations
- Your genotype highlighted
- Chromosome location
- All associated categories and tags
- **Reanalyze with AI**: Choose quality level (Quick/Standard/Premium) for deeper analysis
- Source badge showing which AI model tier was used for the annotation

### Genotype Variants

See explanations for all possible genotypes, with yours highlighted:

![Genotype Explanations](screenshots/2.8-gene-main-page-genotype-explain.png)

Each genotype variant includes:
- Population frequency
- Associated traits or risks
- Scientific citations

### Knowledge Base

Every piece of research about a gene is saved to your personal knowledge base:

![Knowledge Base](screenshots/2.9-gene-main-page-reference.png)

This includes:
- SNPedia raw data
- Claude annotations and improvements
- Your query conversations
- Gene interpretations

---

## Query History

The History tab keeps track of all your genome queries:

![Query History](screenshots/3.1-query-history.png)

Each entry shows:
- Your original question
- When you asked it
- Number of SNPs mentioned in the response
- Ability to re-run or hide queries

Click any query to expand and see the full response, or click the refresh icon to run it again with updated data.

---

## Browse Your Genome

The Browse tab lets you explore all your SNPs with powerful filtering:

![Browse Page](screenshots/4.1-browse-main-page.png)

### Search & Filter Options

- **Text search**: Search by RS number, gene name, or keywords
- **Tag search**: Search and filter by tags with the dedicated search box
- **Multi-tag selection**: Click multiple tags to filter by combinations
- **Genotype labels**: Filter by risk, normal, protective, carrier, or neutral variants
- **Chromosome**: Jump to specific chromosomes
- **Clear all filters**: Reset all active filters with one click

### Tag Filtering

![Tag Search](screenshots/4.3-browse-tag-search.png)

The tag panel shows common tags (20+ SNPs) by default. Use the search box to find specific tags, or check "Include rare" to see more niche categories.

![Multi-Tag Selection](screenshots/4.4-browse-multi-tag.png)

Select multiple tags to find SNPs at the intersection of categories.

### Genotype Labels

![Label Filter](screenshots/4.2-browse-label-filter.png)

The sidebar shows your variants organized by AI classification:
- **Risk**: Variants associated with increased risk or adverse effects
- **Normal**: Common, typical variants (population baseline)
- **Protective**: Variants associated with reduced risk or beneficial effects
- **Carrier**: You carry one copy of a recessive variant
- **Neutral**: Variants with no clear positive or negative impact

---

## Data Log

The Data Log tab shows all system activity and lets you monitor the annotation process:

### Recently Annotated SNPs

![Recent Annotations](screenshots/5.1-data-log-page-recent-annotations.png)

See a live feed of recently annotated genes with:
- Gene title and summary
- Annotation timestamp
- Quick links to view each gene

### Live Claude Conversations

![Live Claude](screenshots/5.2-data-log-live-claude.png)

Watch Claude's reasoning in real-time as it processes annotation requests.

### Raw Audit Log

![Audit Log](screenshots/5.3-data-log-raw-audit-log.png)

The complete data log shows every system event:
- SNPedia data fetches
- Gene discovery matches
- Claude conversations
- Annotation improvements

Filter by source type and search content to find specific entries.

---

## Favorites

Star important SNPs to save them to your Favorites tab:

![Favorites](screenshots/6.1-favorites.png)

Your favorites are displayed as detailed cards showing:
- Gene name and RS number
- Your genotype
- Summary and categories
- Magnitude and risk indicators

Click the star on any gene card throughout the app to add or remove from favorites.

---

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- A 23andMe raw data file (download from 23andMe > Settings > 23andMe Data > Download Raw Data)
- An Anthropic API key (get one at https://console.anthropic.com/)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/v64/genome-browser.git
   cd genome-browser
   ```

2. **Add your genome data**

   Place your 23andMe raw data file in the project root directory:
   ```bash
   cp ~/Downloads/genome_Your_Name_v5_Full_20240101.txt .
   ```

3. **Configure your API key**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here
   ```

4. **Start the application**
   ```bash
   ./start.sh
   ```

5. **Open your browser**

   Navigate to http://localhost:5173 and start exploring your genome!

---

## Background Workers

### Gene Discovery Worker

The app includes an intelligent background worker that continuously expands your knowledge:

1. Starts from genes in your existing annotations
2. Queries Claude for related genes
3. Checks if you have SNPs for discovered genes
4. Auto-annotates any new SNPs found
5. Adds newly discovered genes to the exploration queue

### Priority Sync

On startup, the app automatically fetches annotations for your most important SNPs based on magnitude scores.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1 | Dashboard tab |
| 2 | Query tab |
| 3 | History tab |
| 4 | Browse tab |
| 5 | Data Log tab |
| 6 | Favorites tab |
| Esc | Close sidebar/modal |

---

## Privacy & Security

- **Your data stays local**: All genome data is stored in a local SQLite database on your machine
- **No data uploaded**: Your genetic information is never sent anywhere except to Claude for AI analysis
- **API key required**: You control your own Anthropic API key and usage
- **Git-ignored**: Genome files, database, and `.env` are excluded from version control

---

## Cost Considerations

This app uses the Claude API which has per-token costs:
- **Queries**: ~$0.01-0.05 per query (Claude Sonnet)
- **Gene discovery**: ~$0.001-0.01 per discovery (Claude Haiku)
- **Annotations** (depends on quality level):
  - Quick (Haiku): ~$0.001-0.005 per SNP - fast bulk processing
  - Standard (Sonnet): ~$0.01-0.03 per SNP - balanced detail
  - Premium (Opus): ~$0.05-0.15 per SNP - comprehensive analysis

Responses are cached in the knowledge base to avoid repeat API calls.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "ANTHROPIC_API_KEY not set" | Copy `.env.example` to `.env` and add your API key |
| Genome file not found | Ensure your 23andMe file is in the project root and matches `genome*.txt` |
| Port already in use | Run `pkill -f uvicorn && pkill -f vite` or use `./reset.sh` |
| Database issues | Run `./reset.sh` to clear the database and start fresh |

---

## License

MIT

## Disclaimer

This tool is for educational and informational purposes only. It is not intended to provide medical advice. Always consult with healthcare professionals for medical decisions. Genetic associations are complex and many findings are preliminary or have small effect sizes.
