#!/bin/bash

echo "Testing Transfer Endpoint..."
echo "=============================="
echo ""

# Login and get token
echo "1. Logging in..."
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"victorolanikanju@gmail.com","password":"password123"}' | jq -r '.access_token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  exit 1
fi

echo "✅ Logged in successfully"
echo ""

# Test balance endpoint
echo "2. Testing GET /wallet/balance..."
BALANCE=$(curl -s -X GET http://localhost:3000/wallet/balance \
  -H "Authorization: Bearer $TOKEN")
echo "$BALANCE" | jq .
echo ""

# Test transfer with non-existent user
echo "3. Testing transfer to non-existent user (should fail)..."
curl -s -X POST http://localhost:3000/wallet/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount":5,"recipientIdentifier":"nonexistent@example.com"}' | jq .
echo ""

# Test transfer with amount too high
echo "4. Testing transfer with amount > 10,000 (should fail)..."
curl -s -X POST http://localhost:3000/wallet/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount":15000,"recipientIdentifier":"test@test.com"}' | jq .
echo ""

# Test transfer to self (should fail)
echo "5. Testing transfer to self (should fail)..."
curl -s -X POST http://localhost:3000/wallet/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount":10,"recipientIdentifier":"victorolanikanju@gmail.com"}' | jq .
echo ""

echo "=============================="
echo "Tests complete!"
