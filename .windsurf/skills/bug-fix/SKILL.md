# Skill: bug-fix

## Nom
Bug Fix — Analyse, reproduction, correction et test

## Description
Workflow structuré pour diagnostiquer et corriger un bug dans le bot Discord. Couvre l'analyse de l'erreur, la reproduction, la correction du code, la validation par tests et la documentation.

## Quand l'utiliser
- Un bug est signalé dans le bot
- Une erreur apparaît dans les logs Winston ou Sentry
- Un test échoue inexpliquément
- Un comportement anormal est observé en production

## Déclencheurs
- "corriger ce bug"
- "fix this error"
- "il y a une erreur dans"
- "le bot crash quand"
- "test échoue"
- "bug dans"

## Prérequis
- Node.js 20+ installé
- Accès à la base PostgreSQL (ou Docker)
- Variables d'environnement configurées (`.env`)
- Prisma client généré (`npx prisma generate`)

## Étapes détaillées

### 1. Analyser
- Lire le message d'erreur et la stack trace
- Identifier le fichier concerné dans `src/`
- Vérifier les logs dans `logs/` ou via Sentry
- Examiner le schéma Prisma si l'erreur concerne la DB
- Vérifier les types TypeScript (`npx tsc --noEmit`)

### 2. Reproduire
- Créer ou identifier un test Vitest qui reproduit le bug
- Si le bug est lié à Discord, simuler l'interaction avec un mock
- Vérifier la reproductibilité : `npm test -- <fichier>`

### 3. Corriger
- Localiser la cause racine (pas le symptôme)
- Appliquer la correction minimale dans le fichier concerné
- Si la correction touche plusieurs fichiers, modifier en chaîne
- Respecter le style ESLint/Prettier du projet
- Utiliser les types stricts TypeScript (pas de `any` sauf exception déjà autorisée)

### 4. Tester
- Lancer le test de reproduction : `npm test -- <fichier>`
- Lancer les tests du module concerné : `npm test`
- Vérifier le build : `npx tsc --noEmit`
- Vérifier le lint : `npm run lint`

### 5. Documenter
- Ajouter un commentaire technique si la correction est non-évidente
- Mettre à jour la doc si le comportement change
- Vérifier que le fix ne casse pas d'autres tests

## Commandes exécutables
```bash
npx tsc --noEmit                    # Vérification des types
npm run lint                         # Lint ESLint
npm test                             # Tous les tests Vitest
npm test -- src/path/to/file.test.ts # Test spécifique
npm run format:check                 # Vérification formatage
```

## Vérifications finales
- [ ] Le test de reproduction passe
- [ ] Aucun test existant ne régresse
- [ ] `npx tsc --noEmit` passe sans erreur
- [ ] `npm run lint` ne produit pas d'erreur
- [ ] Le fix adresse la cause racine, pas le symptôme

## Gestion des erreurs
- Si le bug est lié à la DB : vérifier `prisma/schema.prisma` et l'état des migrations
- Si le bug est lié à Redis : vérifier la connexion ioredis et le cache
- Si le bug est lié à l'API Discord : vérifier le token et les permissions du bot
- Si le bug est lié à l'IA : vérifier la clé OpenRouter/OpenAI et les quotas

## Bonnes pratiques
- Toujours créer un test qui reproduit le bug avant de le corriger
- Préférer une correction minimale et ciblée
- Ne pas introduire de `any` — utiliser les types Prisma générés
- Vérifier l'impact sur les cron jobs si le bug touche `src/cron/`
- Vérifier l'impact sur les events si le bug touche `src/events/`
