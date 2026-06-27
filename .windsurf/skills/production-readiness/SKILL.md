# Skill: production-readiness

## Nom
Production Readiness — Vérifications avant mise en production

## Description
Vérification complète avant la mise en production : sécurité, performances, logs, monitoring, sauvegardes et configuration serveur.

## Quand l'utiliser
- Avant la première mise en production
- Avant chaque déploiement en production
- Après des modifications majeures
- Audit de readiness

## Déclencheurs
- "production readiness"
- "prêt pour la production"
- "pre-prod check"
- "vérification production"
- "go live"
- "production check"

## Prérequis
- Tous les tests passent
- Le build réussit
- L'environnement de production est configuré
- Docker et docker-compose opérationnels

## Étapes détaillées

### 1. Sécurité
- Vérifier qu'aucun secret n'est dans le code source
- Vérifier que `.env` de production est sécurisé
- Vérifier les permissions Discord du bot (moindre privilège)
- Vérifier le rate limiting
- Vérifier le whitelist middleware
- Vérifier la validation Zod sur toutes les entrées
- Lancer `npm audit` — aucune vulnérabilité critique

### 2. Performances
- Vérifier le pool de connexions Prisma
- Vérifier la connexion Redis et le cache
- Vérifier les index DB
- Vérifier l'utilisation mémoire (Node.js)
- Vérifier les timeouts des API externes
- Vérifier la gestion des queues BullMQ

### 3. Logs
- Vérifier la configuration Winston (niveau, format, rotation)
- Vérifier que les logs sont écrits dans `logs/`
- Vérifier qu'aucun secret n'est loggé
- Vérifier les logs structurés (JSON)

### 4. Monitoring
- Vérifier la configuration Sentry (DSN, environment)
- Vérifier les métriques Prometheus (prom-client)
- Vérifier le health check endpoint (`/health`)
- Vérifier les alertes Telegram (si configurées)
- Vérifier les process handlers (unhandledRejection, uncaughtException)

### 5. Sauvegardes
- Vérifier que les backups DB sont configurés (`backups/`)
- Vérifier la stratégie de rétention
- Vérifier que les volumes Docker (pg_data) sont persistants
- Tester une restauration de backup

### 6. Configuration serveur
- Vérifier `docker-compose.yml` (services, healthchecks, volumes, ports)
- Vérifier le `Dockerfile` (multi-stage, optimisé)
- Vérifier `ecosystem.config.cjs` (PM2) si utilisé
- Vérifier les scripts de gestion (`start.sh`, `stop.sh`, `restart.sh`, `status.sh`)
- Vérifier les variables d'environnement de production

### 7. Déploiement
- Vérifier la CI GitHub Actions (`ci.yml`)
- Vérifier le workflow de déploiement (`deploy.yml`)
- Vérifier les secrets GitHub (DOCKER_USERNAME, DOCKER_PASSWORD, DISCORD_TOKEN)
- Vérifier les environnements (staging, production)

## Commandes exécutables
```bash
npm audit                           # Vulnérabilités
npm test                            # Tests
npm run test:ci                     # Tests + couverture
npm run build                       # Build
npx tsc --noEmit                    # Type check
npm run lint                        # Lint
npx prisma migrate status           # État des migrations
docker build -t discord-bot .       # Build Docker
docker-compose config               # Vérifier la config Docker
curl http://localhost:3000/health   # Health check
```

## Vérifications finales
- [ ] `npm audit` — aucune vulnérabilité critique
- [ ] Tous les tests passent
- [ ] Le build réussit
- [ ] Aucun secret dans le code
- [ ] Le rate limiting est actif
- [ ] Les logs Winston sont configurés
- [ ] Sentry est configuré
- [ ] Les métriques Prometheus sont exposées
- [ ] Le health check répond 200
- [ ] Les sauvegardes DB sont configurées
- [ ] Le Dockerfile et docker-compose sont valides
- [ ] Les scripts de gestion fonctionnent
- [ ] La CI est configurée pour le déploiement

## Gestion des erreurs
- Si une vulnérabilité critique : la corriger avant la production
- Si les tests échouent : ne pas déployer
- Si le health check échoue : vérifier la configuration et les connexions
- Si Sentry n'est pas configuré : l'ajouter avant la production

## Bonnes pratiques
- Toujours déployer en staging avant la production
- Sauvegarder la DB avant un déploiement majeur
- Monitorer les logs pendant les premières heures après le déploiement
- Garder un plan de rollback prêt
- Vérifier que les cron jobs fonctionnent après le déploiement
- Utiliser les scripts `start.sh`, `stop.sh`, `restart.sh` pour la gestion
