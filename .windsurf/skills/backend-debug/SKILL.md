# Skill: backend-debug

## Nom
Backend Debug — Logs, erreurs serveur, performances, exceptions

## Description
Diagnostic des problèmes backend du bot Discord : analyse des logs Winston, erreurs serveur, problèmes de performances et exceptions non gérées.

## Quand l'utiliser
- Le bot crash ou redémarre inopinément
- Des erreurs apparaissent dans les logs Winston
- Sentry reçoit des erreurs
- Les cron jobs échouent silencieusement
- Les commandes Discord ne répondent pas

## Déclencheurs
- "backend debug"
- "erreur serveur"
- "logs"
- "crash"
- "exception"
- "sentry error"
- "cron échoue"

## Prérequis
- Accès aux logs Winston (`logs/`)
- Accès à Sentry (si configuré)
- PostgreSQL et Redis opérationnels
- Comprendre l'architecture des services (`src/services/`)

## Étapes détaillées

### 1. Logs
- Vérifier les logs Winston dans `logs/` (fichiers JSON)
- Filtrer par niveau : `error`, `warn`, `info`
- Chercher les erreurs récentes avec timestamp
- Identifier le service/composant qui génère l'erreur
- Vérifier le contexte (guildId, userId, commande) dans les logs

### 2. Erreurs serveur
- Vérifier les erreurs non gérées : `src/processHandlers.ts` (gestion des unhandledRejection et uncaughtException)
- Vérifier les erreurs de connexion DB (Prisma)
- Vérifier les erreurs de connexion Redis (ioredis)
- Vérifier les erreurs de l'API Discord (token, permissions, rate limit)
- Vérifier les erreurs des API externes (OpenRouter, RAWG, Steam, Twitter)

### 3. Performances
- Vérifier l'utilisation mémoire du process Node.js
- Vérifier si l'event loop est bloquée (opérations synchrones)
- Vérifier les timeouts des appels API
- Vérifier les fuites de listeners (EventEmitter maxListeners)
- Vérifier les queues BullMQ (`src/queues/`)

### 4. Exceptions
- Vérifier les try-catch manquants
- Vérifier les promesses non attendues (missing `await`)
- Vérifier les erreurs de sérialisation (JSON.parse sur des données invalides)
- Vérifier les erreurs de validation Zod
- Vérifier les erreurs de type (runtime vs compile time)

### 5. Cron jobs
- Vérifier les logs des cron jobs dans `src/cron/`
- Vérifier que les cron jobs s'exécutent à la bonne fréquence
- Vérifier les erreurs de scraping (Playwright, cheerio, RSS)
- Vérifier la barrière temporelle de 48h
- Vérifier la déduplication des notifications

## Commandes exécutables
```bash
npm start                         # Démarrer le bot et observer les logs
npm test                          # Tests
npx tsc --noEmit                  # Type check
# Vérifier les logs :
type logs\error.log               # Windows
cat logs/error.log                # Linux
# Health check
curl http://localhost:3000/health
```

## Vérifications finales
- [ ] L'erreur est identifiée dans les logs
- [ ] La cause racine est déterminée
- [ ] La correction est appliquée
- [ ] Les tests passent après correction
- [ ] L'erreur ne se reproduit plus

## Gestion des erreurs
- Si le bot crash au démarrage : vérifier `.env`, la connexion DB, et le token Discord
- Si Prisma renvoie une erreur : vérifier `DATABASE_URL` et l'état des migrations
- Si Redis renvoie une erreur : vérifier la connexion et la disponibilité
- Si une API externe timeout : vérifier la connectivité et les quotas
- Si un cron job échoue : vérifier le scraping et les données reçues

## Bonnes pratiques
- Toujours logger les erreurs avec contexte (Winston)
- Utiliser Sentry pour les erreurs en production
- Ne jamais laisser une promesse non gérée (toujours `await` ou `.catch()`)
- Vérifier les handlers `processHandlers.ts` pour les erreurs globales
- Utiliser les types Prisma générés pour éviter les erreurs de type runtime
