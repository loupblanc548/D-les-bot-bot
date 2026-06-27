---
description: "Workflow pour reproduire localement la CI GitHub Actions"
---

# /ci-check

Workflow pour reproduire le pipeline CI localement avant de push.

## Étapes

1. **Environnement** — Vérifier Node.js 20+, démarrer PostgreSQL et Redis (`docker-compose up -d postgres redis`)
2. **Dépendances** — `npm ci`
3. **Prisma** — `npx prisma generate` puis `npx prisma migrate deploy`
4. **Pipeline CI** — `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run test:ci`
5. **Docker (optionnel)** — `docker build -t discord-bot-test .`

## Commandes

```bash
docker-compose up -d postgres redis
npm ci
npx prisma generate
npx prisma migrate deploy
npm run format:check
npm run lint
npx tsc --noEmit
npm run test:ci
```

## Skill associé

`.windsurf/skills/ci-check/SKILL.md`
