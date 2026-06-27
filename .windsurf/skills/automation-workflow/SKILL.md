# Skill: automation-workflow

## Nom
Automation Workflow — Scripts automatisés, tâches planifiées, intégrations API

## Description
Création de scripts automatisés, tâches planifiées (cron jobs) et intégrations API pour automatiser les tâches du bot Discord.

## Quand l'utiliser
- Création d'un nouveau cron job dans `src/cron/`
- Création d'un script d'automatisation dans `scripts/`
- Ajout d'une intégration API externe
- Automatisation d'une tâche répétitive

## Déclencheurs
- "automation workflow"
- "automatisation"
- "cron job"
- "tâche planifiée"
- "script automatisé"
- "intégration api"
- "scheduled task"

## Prérequis
- Comprendre la structure des cron jobs (`src/cron/`)
- `node-cron` installé (dans dependencies)
- Comprendre les services existants pour la réutilisation
- Comprendre le `ChannelRouter` pour le routage multi-plateforme

## Étapes détaillées

### 1. Scripts automatisés
- Créer le script dans `scripts/` (TypeScript) ou `src/utils/` si c'est un utilitaire
- Utiliser `tsx` pour exécuter les scripts TypeScript : `npx tsx scripts/<name>.ts`
- Ajouter le script dans `package.json` si c'est une commande récurrente
- Gérer les erreurs et les logs (Winston)
- Ajouter un test Vitest si le script contient de la logique métier

### 2. Tâches planifiées (cron jobs)
- Créer le cron job dans `src/cron/` en suivant le pattern existant
- Utiliser `node-cron` pour la planification
- Définir l'expression cron (fréquence)
- Utiliser les services existants pour la logique métier (ne pas dupliquer)
- Appliquer la barrière temporelle de 48h pour les flux RSS
- Implémenter la déduplication (modèles `Processed*` dans Prisma)
- Utiliser le `ChannelRouter` pour le routage multi-plateforme
- Gérer les erreurs (try-catch, logger avec Winston)

### 3. Intégrations API
- Créer un service dans `src/services/` pour l'intégration
- Utiliser `axios` pour les requêtes HTTP (déjà dans les dependencies)
- Gérer les timeouts, retries et erreurs
- Mettre en cache les réponses avec Redis si pertinent
- Valider les réponses avec Zod si la structure est critique
- Logger les appels API (latence, succès/échec)

### 4. Enregistrement
- Enregistrer le cron job dans le système de démarrage (`src/startup.ts`)
- Vérifier que le cron job est démarré au lancement du bot
- Tester manuellement le cron job avant de le planifier

### 5. Tests
- Écrire un test Vitest pour la logique du cron job
- Tester les cas nominaux et d'erreur
- Vérifier la déduplication
- Vérifier le routage multi-plateforme

## Commandes exécutables
```bash
npx tsx scripts/<name>.ts         # Exécuter un script
npm test -- src/cron/             # Tests des cron jobs
npm run lint                      # Lint
npx tsc --noEmit                  # Type check
npm start                         # Démarrer le bot (cron jobs inclus)
```

## Vérifications finales
- [ ] Le cron job est créé dans `src/cron/`
- [ ] Le cron job est enregistré dans `src/startup.ts`
- [ ] L'expression cron est correcte
- [ ] La logique utilise les services existants
- [ ] La déduplication est implémentée
- [ ] Le routage multi-plateforme utilise le `ChannelRouter`
- [ ] Les erreurs sont gérées (try-catch, logs)
- [ ] Les tests passent

## Gestion des erreurs
- Si le cron job ne s'exécute pas : vérifier l'expression cron et l'enregistrement dans startup
- Si l'API externe ne répond pas : vérifier la connectivité et ajouter un retry
- Si les notifications sont dupliquées : vérifier la déduplication (modèles `Processed*`)
- Si le routage ne fonctionne pas : vérifier le `ChannelRouter` et les salons configurés

## Bonnes pratiques
- Suivre le pattern des cron jobs existants (`dealsCron`, `freeGamesCron`, `steamNewsCron`, `twitterCron`)
- Appliquer la barrière temporelle de 48h pour les flux RSS
- Utiliser les modèles `Processed*` pour la déduplication
- Ne pas dupliquer la logique — utiliser les services existants
- Logger les exécutions de cron (succès, échec, nombre d'items traités)
- Gérer les erreurs de scraping (Playwright, cheerio, RSS) sans crasher le bot
