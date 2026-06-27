---
description: "Workflow de déploiement — vérifications, Docker, post-déploiement"
---

# /deploy

Workflow pour déployer le bot Discord en production.

## Étapes

1. **Pré-déploiement** — `npm test`, `npm run build`, `npm run lint`, `npx prisma migrate status`
2. **Build Docker** — `docker build -t discord-surveillance-bot .`, tester avec `docker-compose up -d`
3. **Déploiement** — Docker Compose, Railway, ou PM2 selon la cible
4. **Post-déploiement** — `curl http://localhost:3000/health`, vérifier le bot sur Discord, vérifier les logs
5. **Rollback (si nécessaire)** — Docker: ancienne image, Railway: dashboard, PM2: `pm2 restart`

## Commandes

```bash
npm test
npm run build
npx prisma migrate status
docker build -t discord-surveillance-bot .
docker-compose up -d --build
curl http://localhost:3000/health
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs
```

## Skill associé

`.windsurf/skills/deploy/SKILL.md`
