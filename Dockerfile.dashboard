# ---- Dashboard Dockerfile (web-only, no Electron) ----
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY tsconfig.json ./

RUN npm ci

RUN npx prisma generate

# ---- Production Stage ----
FROM node:20-alpine

RUN apk add --no-cache dumb-init openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json ./

RUN npx prisma generate

RUN addgroup -g 1001 botuser && adduser -u 1001 -G botuser -s /bin/sh -D botuser
USER botuser

EXPOSE 3721

ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "tsx", "src/dashboard/server.ts"]
