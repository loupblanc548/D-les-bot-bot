# Skill: deploy

## Nom
Deploy — Préparation déploiement, vérifications avant mise en ligne

## Description
Préparation et vérifications avant le déploiement du bot Discord en production (Docker, Railway, ou serveur bare-metal).

## Quand l'utiliser
- Déploiement en production
- Déploiement en staging
- Mise à jour du bot en cours d'exécution
- Déploiement via Docker ou Railway

## Déclencheurs
- "deploy"
- "déploiement"
- "mise en production"
- "deploy to railway"
- "docker deploy"
- "production"

## Prérequis
- Tous les tests passent
- Le build réussit
- Variables d'environnement de production configurées
- Accès au serveur ou à la plateforme de déploiement

## Étapes détaillées

### 1. Vérifications pré-déploiement
- Lancer les tests : `npm test`
- Vérifier le build : `npm run build`
- Vérifier le lint : `npm run lint`
- Vérifier les types : `npx tsc --noEmit`
- Vérifier que `.env` de production est complet (token Discord, DATABASE_URL, Redis, etc.)
- Vérifier que les migrations Prisma sont à jour : `npx prisma migrate status`

### 2. Build Docker
- Vérifier le `Dockerfile` (multi-stage, optimisé)
- Construire l'image : `docker build -t discord-surveillance-bot .`
- Vérifier la taille de l'image
- Tester l'image localement : `docker-compose up -d`

### 3. Vérifications Docker Compose
- Vérifier `docker-compose.yml` (services bot, postgres, redis)
- Vérifier les healthchecks
- Vérifier les volumes (pg_data, redis_data, backups, logs)
- Vérifier les ports (3000 pour le bot, 5432 pour PG, 6379 pour Redis)
- Vérifier les variables d'environnement

### 4. Déploiement

#### Option A : Docker Compose (serveur)
```bash
docker-compose pull
docker-compose up -d --build
```

#### Option B : Railway
- Vérifier la configuration Railway (`docs/RAILWAY_DEPLOYMENT_GUIDE.md`)
- Push sur la branche main/master (la CI déploie automatiquement)
- Vérifier les logs Railway

#### Option C : PM2 (serveur bare-metal)
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### 5. Vérifications post-déploiement
- Vérifier le health check : `curl http://localhost:3000/health`
- Vérifier que le bot est en ligne sur Discord
- Vérifier les logs Winston : `logs/`
- Vérifier les métriques Prometheus
- Vérifier que Sentry ne reçoit pas d'erreurs
- Tester une commande Discord simple (`/status`)

### 6. Rollback (si nécessaire)
- Pour Docker : `docker-compose down` puis redémarrer l'ancienne image
- Pour Railway : utiliser le rollback dans le dashboard
- Pour PM2 : `pm2 restart` avec l'ancienne version

## Commandes exécutables
```bash
npm test                           # Tests
npm run build                      # Build
npx prisma migrate status          # État des migrations
docker build -t discord-surveillance-bot .  # Build Docker
docker-compose up -d --build       # Déployer avec Docker
curl http://localhost:3000/health  # Health check
pm2 start ecosystem.config.cjs     # Déployer avec PM2
pm2 status                         # Statut PM2
pm2 logs                           # Logs PM2
```

## Vérifications finales
- [ ] Tous les tests passent
- [ ] Le build réussit
- [ ] L'image Docker est construite
- [ ] Le health check répond 200
- [ ] Le bot est en ligne sur Discord
- [ ] Aucune erreur dans Sentry
- [ ] Les logs Winston ne montrent pas d'erreur critique
- [ ] Les cron jobs fonctionnent (vérifier après quelques minutes)

## Gestion des erreurs
- Si le bot ne démarre pas : vérifier les logs Docker/PM2 et les variables d'environnement
- Si la DB n'est pas accessible : vérifier DATABASE_URL et la connexion PostgreSQL
- Si Redis n'est pas accessible : vérifier la connexion Redis
- Si le token Discord est invalide : vérifier DISCORD_TOKEN
- Si les commandes ne répondent pas : vérifier l'enregistrement des commandes (`npm run register`)

## Bonnes pratiques
- Toujours déployer en staging avant la production
- Garder l'ancienne image Docker pour un rollback rapide
- Vérifier le health check après chaque déploiement
- Monitorer les logs pendant les premières minutes après le déploiement
- Utiliser les scripts `start.sh`, `stop.sh`, `restart.sh` pour la gestion du bot
- Sauvegarder la DB avant un déploiement majeur
