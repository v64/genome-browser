#!/bin/bash

# Genome Browser Startup Script
# Starts both backend and frontend servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧬 Starting Genome Browser..."
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    exit 1
fi

# Install backend dependencies if needed
if [ ! -d "backend/.venv" ]; then
    echo "📦 Setting up Python virtual environment..."
    python3 -m venv backend/.venv
fi

source backend/.venv/bin/activate

echo "📦 Installing backend dependencies..."
pip install -q -r backend/requirements.txt

# Install frontend dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

# Start backend in background
echo "🚀 Starting backend server on http://localhost:8000..."
cd backend
python run.py &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 2

# Start frontend
echo "🚀 Starting frontend server on http://localhost:5173..."
cd frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!
cd ..

# Wait a moment then open browser
sleep 3
echo ""
echo "✅ Genome Browser is running!"
echo ""
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Handle Ctrl+C to kill both processes
trap "echo ''; echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Wait for either process to exit
wait
