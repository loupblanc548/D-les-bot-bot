---
description: "Workflow de vérification avant mise en production"
---

# /production-readiness

Workflow pour vérifier que le bot est prêt pour la production.

## Étapes

1. **Sécurité** — `npm audit`, vérifier les secrets, le rate limiting, le whitelist, la validation Zod
2. **Performances** — Vérifier le pool Prisma, le cache Redis, les index DB, l'utilisation mémoire
3. **Logs** — Vérifier Winston (niveau, format, rotation), aucun secret loggé
4. **Monitoring** — Vérifier Sentry, Prometheus, le health check, les alertes Telegram
5. **Sauvegardes** — Vérifier les backups DB, la persistance des volumes Docker
6. **Serveur** — Vérifier `docker-compose.yml`, `Dockerfile`, `ecosystem.config.cjs`, les scripts
7. **Déploiement** — Vérifier la CI, les secrets GitHub, les environnements staging/production

## Commandes

```bash
npm audit
npm test
npm run test:ci
npm run build
npx tsc --noEmit
npm run lint
npx prisma migrate status
docker build -t discord-bot .
docker-compose config
curl http://localhost:3000/health
```

## Skill associé

`.windsurf/skills/production-readiness/SKILL.md`
