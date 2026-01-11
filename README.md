# Genome Browser

A personal genome exploration tool that combines your 23andMe genetic data with Claude AI to help you understand your DNA. Browse your SNPs, get AI-powered interpretations, and build a growing knowledge base about your genetic variants.

![Genome Browser](https://img.shields.io/badge/23andMe-Compatible-green) ![Claude AI](https://img.shields.io/badge/Claude-Powered-purple)

## Features

- **Browse Your Genome**: Search and filter your ~600,000+ SNPs by chromosome, gene, category, or keyword
- **AI-Powered Insights**: Ask Claude anything about your genome ("What genes affect my caffeine metabolism?") and get personalized answers based on your actual genotypes
- **SNPedia Integration**: Automatically fetches scientific annotations from SNPedia for context
- **Smart Enrichment**: Claude automatically improves SNP annotations with titles, tags, and detailed genotype explanations
- **Knowledge Base**: Every AI interaction is saved and searchable, building your personal genetic knowledge base over time
- **Favorites & Labels**: Mark important variants and label your genotypes (normal, risk, protective, etc.)
- **Dark Mode**: Easy on the eyes for late-night genome browsing

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- A 23andMe raw data file (download from 23andMe > Settings > 23andMe Data > Download Raw Data)
- An Anthropic API key (get one at https://console.anthropic.com/)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/genome.git
   cd genome
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
- Filter by chromosome or category
- Click any SNP to see full details including your genotype and what it means

### Improve Annotations

On any SNP detail page, click **Improve with Claude** to:
- Generate a descriptive title
- Add relevant tags/categories
- Get detailed genotype explanations
- Optionally provide custom instructions for the improvement

### Favorites

Star important SNPs to save them to your favorites list for quick access.

## Project Structure

```
genome/
├── backend/              # FastAPI Python backend
│   ├── app/
│   │   ├── main.py       # API entry point
│   │   ├── database.py   # SQLite database operations
│   │   ├── claude_service.py  # Claude AI integration
│   │   ├── learning_agent.py  # Background enrichment agent
│   │   ├── snpedia.py    # SNPedia data fetching
│   │   └── routers/      # API route handlers
│   └── requirements.txt
├── frontend/             # React + Vite frontend
│   ├── src/
│   │   ├── components/   # React components
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

## Privacy & Security

- **Your data stays local**: All genome data is stored in a local SQLite database on your machine
- **No data uploaded**: Your genetic information is never sent anywhere except to Claude for AI analysis
- **API key required**: You control your own Anthropic API key and usage
- **Git-ignored**: Genome files, database, and `.env` are excluded from version control

## Cost Considerations

This app uses the Claude API which has per-token costs:
- Queries and improvements use Claude Sonnet 4.5
- Typical query: ~$0.01-0.05 depending on complexity
- SNP improvement: ~$0.02-0.05 per SNP
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

## License

MIT

## Disclaimer

This tool is for educational and informational purposes only. It is not intended to provide medical advice. Always consult with healthcare professionals for medical decisions. Genetic associations are complex and many findings are preliminary or have small effect sizes.
