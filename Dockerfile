# ---- Build Stage ----
# TODO(CONT-001): Pin to specific digest once CI supports it
# FROM node:22-alpine@sha256:<digest> AS builder
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl libc6-compat python3 make g++

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY scripts ./scripts

RUN npm install --ignore-scripts=false || npm install --ignore-scripts=true

ENV DATABASE_URL="postgresql://discord_bot:discord_bot@postgres:5432/discord_bot?schema=public"
ENV PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh
RUN npx prisma generate || npx prisma generate --data-proxy || true

# ---- Production Stage ----
FROM node:22-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=512

# Copy source FIRST to bust cache on code changes
COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY .env.example ./.env.example

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

ENV DATABASE_URL="postgresql://discord_bot:discord_bot@postgres:5432/discord_bot?schema=public"
RUN npx prisma generate || true

RUN addgroup -S botuser && adduser -S botuser -G botuser
USER botuser

EXPOSE 8080

CMD ["node", "--expose-gc", "--import", "tsx", "src/index.ts"]
