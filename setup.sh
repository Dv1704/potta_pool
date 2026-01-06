#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Potta Server Setup ===${NC}"

# Navigate to server directory
cd /home/victor/projects/potta/server

# Step 1: Clean up
echo -e "\n${BLUE}[1/5] Cleaning old node_modules and cache...${NC}"
rm -rf node_modules
rm -rf package-lock.json
npm cache clean --force

# Step 2: Install dependencies
echo -e "\n${BLUE}[2/5] Installing dependencies...${NC}"
npm install

# Step 3: Generate Prisma client
echo -e "\n${BLUE}[3/5] Generating Prisma client...${NC}"
npx prisma generate

# Step 4: Push database schema
echo -e "\n${BLUE}[4/5] Pushing Prisma schema to database...${NC}"
npx prisma db push

# Step 5: Test build
echo -e "\n${BLUE}[5/5] Testing TypeScript compilation...${NC}"
npm run build

echo -e "\n${GREEN}✅ Setup complete!${NC}"
echo -e "\n${GREEN}To start the server:${NC}"
echo -e "  npm run start:dev"
echo -e "\n${GREEN}Swagger UI will be available at:${NC}"
echo -e "  http://localhost:3000/api"
