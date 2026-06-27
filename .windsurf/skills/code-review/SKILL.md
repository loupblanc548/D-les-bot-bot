# Skill: code-review

## Nom
Code Review — Qualité, sécurité, performances, architecture, bonnes pratiques

## Description
Revue de code structurée pour le bot Discord, couvrant la qualité du code, la sécurité, les performances, l'architecture et les bonnes pratiques TypeScript/Node.js.

## Quand l'utiliser
- Avant de merger une Pull Request
- Après l'implémentation d'une feature
- Revue périodique de la dette technique
- Audit de qualité d'un module

## Déclencheurs
- "revue de code"
- "code review"
- "vérifier ce code"
- "review this PR"
- "audit qualité"
- "code quality"

## Prérequis
- Accès au code source dans `src/`
- ESLint et Prettier configurés
- Comprendre les patterns du projet (Singleton, Factory, Repository via Prisma)

## Étapes détaillées

### 1. Qualité du code
- Vérifier le respect des conventions TypeScript strictes
- Chercher les `any` non justifiés
- Vérifier la gestion des erreurs (try-catch, gestion des promesses)
- Chercher le code dupliqué
- Vérifier la lisibilité et le nommage

### 2. Sécurité
- Vérifier qu'aucun secret n'est hardcoded (tokens, clés API)
- Vérifier l'utilisation de Zod pour la validation des entrées
- Vérifier la prévention d'injection SQL (Prisma paramétré)
- Vérifier les permissions Discord sur les commandes admin
- Vérifier la gestion du whitelist middleware

### 3. Performances
- Vérifier l'utilisation du cache Redis pour les appels API répétés
- Chercher les N+1 queries Prisma
- Vérifier l'utilisation de `select` / `include` dans les queries Prisma
- Vérifier la gestion de la mémoire (pas de fuites, cleanup des listeners)
- Vérifier l'async/await correct (pas de blocage de l'event loop)

### 4. Architecture
- Vérifier le respect de la séparation des couches (commands → services → data)
- Vérifier que les services sont réutilisables et non couplés aux commandes
- Vérifier l'utilisation correcte des managers pour la coordination
- Vérifier que les cron jobs utilisent les services et ne dupliquent pas la logique

### 5. Bonnes pratiques
- Vérifier le formatage Prettier : `npm run format:check`
- Vérifier le lint ESLint : `npm run lint`
- Vérifier les types : `npx tsc --noEmit`
- Vérifier la couverture de tests : `npm run test:ci`

## Commandes exécutables
```bash
npm run lint                  # Lint ESLint
npm run format:check          # Vérification Prettier
npx tsc --noEmit              # Type check
npm run test:ci               # Tests avec couverture
npm test                      # Tests rapides
```

## Vérifications finales
- [ ] Aucun `any` non justifié
- [ ] Aucun secret hardcoded
- [ ] Validation des entrées avec Zod
- [ ] Pas de N+1 queries
- [ ] Gestion d'erreurs appropriée
- [ ] Architecture respectée
- [ ] Lint, format, types, tests — tous verts

## Gestion des erreurs
- Si des problèmes critiques sont trouvés : bloquer le merge
- Si des warnings ESLint : recommander la correction
- Si la couverture de tests est < 40% : recommander d'ajouter des tests

## Bonnes pratiques
- Toujours reviewer dans l'ordre : sécurité > qualité > perf > architecture
- Vérifier l'impact sur les cron jobs existants
- Vérifier l'impact sur les events Discord
- S'assurer que les nouvelles commandes sont enregistrées
