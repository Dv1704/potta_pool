#!/bin/bash

# Simple quick test - just test the Aviator timeout mechanism

echo "🎮 Quick Aviator Timeout Test"
echo "=============================="
echo ""

# First, fund the test user
EMAIL="testbackend@potta.com"
echo "📝 Funding test user: $EMAIL"

# Get user ID
USER_ID=$(psql -d potta -t -c "SELECT id FROM \"User\" WHERE email='$EMAIL' LIMIT 1;" | tr -d ' ')

if [ -z "$USER_ID" ]; then
    echo "❌ User not found!"
    exit 1
fi

echo "✅ User ID: $USER_ID"

# Add balance directly
echo "💰 Adding 1000 GHS to wallet..."
psql -d potta -c "UPDATE \"Wallet\" SET \"availableBalance\" = 1000 WHERE \"userId\" = '$USER_ID';" > /dev/null

echo "✅ Balance updated!"
echo ""
echo "Now run the test script with this user..."
echo "The test should complete in ~70 seconds"
echo ""
