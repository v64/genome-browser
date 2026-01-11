#!/bin/bash

# Reset Genome Browser - clears cache and restarts fresh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 Resetting Genome Browser..."

# Kill any running servers
pkill -f "uvicorn.*app.main:app" 2>/dev/null
pkill -f "vite.*genome" 2>/dev/null

# Remove the cache database
if [ -f "data/cache.db" ]; then
    rm "data/cache.db"
    echo "✓ Deleted cache database"
else
    echo "✓ No cache to delete"
fi

echo "✓ Reset complete"
echo ""
echo "Run ./start.sh to start fresh"
