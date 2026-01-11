# Genome Browser

A personal genome exploration tool that combines your 23andMe genetic data with Claude AI to help you understand your DNA. Browse your SNPs, get AI-powered interpretations, and build a growing knowledge base about your genetic variants.

[![GitHub](https://img.shields.io/github/license/v64/genome-browser)](https://github.com/v64/genome-browser) ![23andMe](https://img.shields.io/badge/23andMe-Compatible-green) ![Claude AI](https://img.shields.io/badge/Claude-Powered-purple)

## Features

### Core Features
- **Browse Your Genome**: Search and filter your ~600,000+ SNPs by chromosome, gene, category, tag, or keyword
- **AI-Powered Insights**: Ask Claude anything about your genome and get personalized answers based on your actual genotypes
- **SNPedia Integration**: Automatically fetches scientific annotations from SNPedia for context
- **Smart Enrichment**: Claude automatically improves SNP annotations with titles, tags, and detailed genotype explanations
- **Knowledge Base**: Every AI interaction is saved and searchable, building your personal genetic knowledge base over time

### Dashboard
- **Risk Dashboard**: Visual overview of your genetic variants by category
- **AI Query Suggestions**: Claude analyzes your genome activity and suggests personalized questions to explore
- **Activity Stats**: Track your exploration progress and knowledge base growth

### Query System
- **Natural Language Queries**: Ask questions like "What genes affect my caffeine metabolism?" or "Do I have any MTHFR mutations?"
- **Query History**: Browse all your previous queries with full responses, mentioned SNPs, and the ability to re-run any query
- **Persistent Query State**: Your query text and results persist across tab switches and navigation

### Browse & Filter
- **Tag Filtering**: Filter SNPs by tags (health, metabolism, cognition, etc.) from the sidebar or by clicking tags on any SNP
- **Label Filtering**: View SNPs by your assigned labels (normal, abnormal, rare, protective)
- **Category Filtering**: Filter by predefined categories (Health, Traits, Intelligence, Ancestry)
- **Chromosome Browser**: Jump to SNPs on specific chromosomes
- **Persistent Browse State**: Your search results persist when navigating to SNP details and back

### SNP Details
- **Full Page View**: Detailed SNP information with genotype interpretation, citations, and related genes
- **Improve with Claude**: One-click AI enhancement of any SNP annotation
- **Custom Instructions**: Provide specific instructions when improving annotations
- **Citation Tracking**: See sources for all information with clickable references

### Organization
- **Favorites**: Star important SNPs for quick access
- **Labels**: Classify your genotypes (normal, abnormal, rare, protective, uncertain)
- **Data Log**: View all data ingestion activity, Claude conversations, and system events

### Background Workers
- **Gene Discovery Worker**: Continuously discovers related genes by querying Claude, finds SNPs for new genes in your data, and auto-improves them
- **Random SNP Exploration**: Periodically explores random unannotated SNPs to seed new discoveries
- **Priority Sync**: Automatically fetches annotations for important SNPs on startup

### Additional Features
- **Dark Mode**: Easy on the eyes for late-night genome browsing
- **Export**: Download your genome data and annotations
- **Chat Panel**: Quick chat interface for genome questions without leaving your current view

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

   Place your 23andMe raw data file in the project root directory. The file should be named something like `genome_Your_Name_v5_Full_*.txt`.

   ```bash
   # Example - copy your downloaded file to the project root
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

   This will:
   - Create a Python virtual environment and install backend dependencies
   - Install frontend dependencies (first run only)
   - Start the backend server on http://localhost:8000
   - Start the frontend server on http://localhost:5173
   - Import your genome data into the local database
   - Start background workers for gene discovery and SNP enrichment

5. **Open your browser**

   Navigate to http://localhost:5173 and start exploring your genome!

## Usage

### Query Your Genome

Use the **Query** tab to ask natural language questions:
- "What genes affect intelligence?"
- "Do I have any MTHFR mutations?"
- "What are my risk variants for heart disease?"
- "Genes related to caffeine metabolism"

Claude will search your genome, find relevant SNPs, look up your genotypes, and provide personalized interpretations.

### Browse SNPs

Use the **Browse** tab to:
- Search by rsID, gene name, or keyword
- Filter by tags using `tag:tagname` syntax in search or the sidebar
- Filter by chromosome, category, or label
- Click any SNP to see full details including your genotype and what it means

### Query History

Use the **History** tab to:
- Browse all your previous queries
- See full responses and mentioned SNPs
- Click SNP links to view details
- Re-run any previous query

### Improve Annotations

On any SNP detail page, click **Improve with Claude** to:
- Generate a descriptive title
- Add relevant tags/categories
- Get detailed genotype explanations
- Optionally provide custom instructions for the improvement

### Data Log

Use the **Data Log** tab to monitor:
- SNPedia data fetching activity
- Claude conversations and improvements
- Gene discovery worker progress
- System events and errors

### Favorites

Star important SNPs to save them to your favorites list for quick access.

## Background Workers

### Gene Discovery Worker

The gene discovery worker runs automatically in the background:
1. Starts from genes in your existing annotations
2. Queries Claude for related genes
3. Checks if you have SNPs for discovered genes
4. Auto-improves any unimproved SNPs found
5. Adds newly discovered genes to the exploration queue
6. Periodically explores random unannotated SNPs to find new leads

Monitor the worker in the console output (`./start.sh`) or via the Data Log tab.

**API Endpoints:**
- `GET /api/agent/discovery/status` - Check worker status
- `POST /api/agent/discovery/start` - Manually start the worker
- `POST /api/agent/discovery/stop` - Stop the worker
- `GET /api/agent/discovery/logs` - View worker logs

## Project Structure

```
genome/
├── backend/              # FastAPI Python backend
│   ├── app/
│   │   ├── main.py       # API entry point
│   │   ├── database.py   # SQLite database operations
│   │   ├── claude_service.py  # Claude AI integration
│   │   ├── learning_agent.py  # Background enrichment agent
│   │   ├── gene_discovery.py  # Gene discovery worker
│   │   ├── snpedia.py    # SNPedia data fetching
│   │   └── routers/      # API route handlers
│   └── requirements.txt
├── frontend/             # React + Vite frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── RiskDashboard.jsx  # Dashboard with suggestions
│   │   │   ├── GenomeQuery.jsx    # Query interface
│   │   │   ├── QueryHistory.jsx   # Query history browser
│   │   │   ├── SnpList.jsx        # SNP list with infinite scroll
│   │   │   ├── SnpFullPage.jsx    # Full SNP detail view
│   │   │   ├── DataLogViewer.jsx  # Data log monitor
│   │   │   └── ...
│   │   └── api/          # API client
│   └── package.json
├── data/                 # SQLite database (created on first run)
├── .env.example          # Environment template
├── start.sh              # Startup script
├── reset.sh              # Reset script (clears database)
└── genome_*.txt          # Your 23andMe data file (not committed)
```

## Scripts

- **`./start.sh`** - Start both backend and frontend servers
- **`./reset.sh`** - Clear the database and start fresh (re-imports genome data on next start)

## Keyboard Shortcuts

- **1** - Dashboard tab
- **2** - Query tab
- **3** - History tab
- **4** - Browse tab
- **5** - Data Log tab
- **6** - Favorites tab
- **Escape** - Close SNP detail panel

## Privacy & Security

- **Your data stays local**: All genome data is stored in a local SQLite database on your machine
- **No data uploaded**: Your genetic information is never sent anywhere except to Claude for AI analysis
- **API key required**: You control your own Anthropic API key and usage
- **Git-ignored**: Genome files, database, and `.env` are excluded from version control

## Cost Considerations

This app uses the Claude API which has per-token costs:
- **Queries and improvements**: Claude Sonnet 4.5 (~$0.01-0.05 per query)
- **Gene discovery**: Claude Haiku 4 (~$0.001-0.01 per discovery query)
- **SNP improvement**: ~$0.02-0.05 per SNP
- Responses are cached in the knowledge base to avoid repeat API calls

## Troubleshooting

**"ANTHROPIC_API_KEY not set"**
- Make sure you copied `.env.example` to `.env` and added your API key

**Genome file not found**
- Ensure your 23andMe file is in the project root (not in a subdirectory)
- The file should match the pattern `genome*.txt`

**Port already in use**
- Kill existing processes: `pkill -f uvicorn && pkill -f vite`
- Or run `./reset.sh` which handles this automatically

**Database issues**
- Run `./reset.sh` to clear the database and start fresh

**Gene discovery not running**
- Check console output for `[DISCOVERY]` logs
- Verify Claude API key is configured
- Check `/api/agent/discovery/status` endpoint

## License

MIT

## Disclaimer

This tool is for educational and informational purposes only. It is not intended to provide medical advice. Always consult with healthcare professionals for medical decisions. Genetic associations are complex and many findings are preliminary or have small effect sizes.
