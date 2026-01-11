#!/bin/bash

# Game Completion Safeguards Test Script
# This script runs the comprehensive test suite for game timeout and cleanup

echo "🧪 Starting Game Completion Safeguards Test..."
echo "================================================"
echo ""
echo "⚠️  This test will:"
echo "  - Place an Aviator bet and wait 70 seconds for timeout"
echo "  - Test error handling in dice and coin games"
echo "  - Check database for stuck games"
echo "  - Verify cron cleanup is working"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."
echo ""

# Run the TypeScript test script
npx tsx test-game-safeguards.ts

echo ""
echo "✅ Test completed!"
echo ""
echo "📊 To manually check the database, run:"
echo "   psql -d potta -c \"SELECT status, COUNT(*) FROM \\\"Game\\\" GROUP BY status;\""
echo ""
echo "📝 To check server logs for cron execution:"
echo "   Check the terminal running 'npm start' for GameCleanupService logs"
