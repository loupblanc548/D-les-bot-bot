# ---- Build Stage ----
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY tsconfig.json ./

RUN npm ci

RUN npx prisma generate

# ---- Production Stage ----
FROM node:22-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

# Copy source FIRST to bust cache on code changes
COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY .env.example ./.env.example

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

RUN npx prisma generate

EXPOSE 8080

CMD ["node", "--expose-gc", "--import", "tsx", "src/index.ts"]
