---
description: "Workflow de configuration d'environnement — installation, Docker, .env"
---

# /environment-setup

Workflow pour configurer l'environnement de développement.

## Étapes

1. **Dépendances** — `npm install`
2. **Variables d'environnement** — `cp .env.example .env`, configurer DISCORD_TOKEN, DATABASE_URL, etc.
3. **Docker** — `docker-compose up -d postgres redis`, vérifier `pg_isready` et `redis-cli ping`
4. **Prisma** — `npx prisma generate` puis `npx prisma migrate dev`
5. **Commandes Discord** — `npm run register`
6. **Vérification** — `npm start`, `curl http://localhost:3000/health`

## Commandes

```bash
npm install
cp .env.example .env
docker-compose up -d postgres redis
npx prisma generate
npx prisma migrate dev
npm run register
npm start
```

## Skill associé

`.windsurf/skills/environment-setup/SKILL.md`
