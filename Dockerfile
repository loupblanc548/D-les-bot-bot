# ---- Build Stage ----
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl libc6-compat git

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY tsconfig.json ./

RUN npm ci

RUN npx prisma generate

# ---- Production Stage ----
FROM node:22-alpine

RUN apk add --no-cache dumb-init chromium openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=384
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY .env.example ./.env.example

# Force cache invalidation: write build timestamp
RUN date > /app/BUILD_TIME.txt

RUN npx prisma generate

RUN addgroup -g 1001 botuser && adduser -u 1001 -G botuser -s /bin/sh -D botuser
USER botuser

EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--expose-gc", "--import", "tsx", "src/index.ts"]
