#!/bin/bash
# Subscription Tracker Startup Script

echo "💳 Starting Subscription Tracker..."
echo ""

# Check if gog is installed
if ! command -v gog &> /dev/null; then
    echo "❌ Error: 'gog' CLI is not installed or not in PATH"
    echo "Install: brew install steipete/tap/gogcli"
    exit 1
fi

# Check if gog is authenticated
if ! gog auth list &> /dev/null; then
    echo "❌ Error: 'gog' is not authenticated"
    echo "Run: gog auth add your-email@gmail.com --services gmail"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    npm install
fi

# Check if database exists and has data
if [ ! -f "data/subscriptions.db" ]; then
    echo "🌱 Database not found. Running seed script with sample data..."
    node src/seed.js
    echo ""
    echo "ℹ️  Sample data loaded. You can scan your Gmail to replace with real data."
    echo "   Run: npm run scan"
    echo ""
fi

# Start the server
echo "🚀 Starting dashboard..."
npm start
