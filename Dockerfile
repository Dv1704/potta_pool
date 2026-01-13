FROM node:22-alpine

WORKDIR /usr/src/app

# Install dependencies for Prisma (OpenSSL)
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

# Provide dummy URLs for prisma generate and build during build process
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" DIRECT_URL="postgresql://postgres:postgres@localhost:5432/postgres" npx prisma generate
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" DIRECT_URL="postgresql://postgres:postgres@localhost:5432/postgres" npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
