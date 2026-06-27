# Skill: test-before-pr

## Nom
Test Before PR — Lancer tous les tests, vérifier le build, vérifier le lint

## Description
Validation complète avant de créer une Pull Request : tests, build, lint, formatage, type check. Reproduit localement ce que la CI GitHub Actions va vérifier.

## Quand l'utiliser
- Avant de créer une Pull Request
- Avant de push sur main/master
- Après des modifications importantes
- Vérification que tout est vert avant merge

## Déclencheurs
- "test before pr"
- "vérifier avant PR"
- "pre-commit check"
- "tout est vert"
- "validate before push"
- "pre-push"

## Prérequis
- Toutes les dépendances installées (`npm install`)
- Prisma client généré (`npx prisma generate`)
- PostgreSQL et Redis accessibles (ou Docker)

## Étapes détaillées

### 1. Vérifier le formatage (Prettier)
```bash
npm run format:check
```
- Si échec : lancer `npm run format` pour corriger automatiquement

### 2. Vérifier le lint (ESLint)
```bash
npm run lint
```
- Si erreurs : corriger les problèmes signalés
- Les warnings sont acceptables mais doivent être minimisés

### 3. Vérifier les types (TypeScript)
```bash
npx tsc --noEmit
```
- Si erreurs : corriger les types avant de continuer

### 4. Lancer les tests (Vitest)
```bash
npm test
```
- Tous les tests doivent passer
- Si un test échoue : corriger le code ou le test

### 5. Lancer les tests avec couverture
```bash
npm run test:ci
```
- Vérifier que les seuils de couverture sont respectés (lines: 40%, functions: 40%, branches: 30%)
- Si en dessous : ajouter des tests

### 6. Vérifier le build
```bash
npm run build
```
- Le build TypeScript doit réussir sans erreur

### 7. Vérifier les hooks Git
```bash
npm run prepare
```
- Husky et lint-staged doivent être configurés

## Commandes exécutables
```bash
npm run format:check     # Prettier
npm run format           # Prettier (auto-fix)
npm run lint             # ESLint
npx tsc --noEmit         # TypeScript
npm test                 # Vitest
npm run test:ci          # Vitest + couverture
npm run build            # Build TypeScript
```

## Vérifications finales
- [ ] `npm run format:check` passe
- [ ] `npm run lint` passe (0 erreur)
- [ ] `npx tsc --noEmit` passe (0 erreur)
- [ ] `npm test` passe (tous les tests verts)
- [ ] `npm run test:ci` respecte les seuils de couverture
- [ ] `npm run build` réussit

## Gestion des erreurs
- Si Prettier échoue : `npm run format` puis re-vérifier
- Si ESLint échoue : corriger les erreurs, les warnings sont non-bloquants
- Si TypeScript échoue : corriger les types — ne pas utiliser `any` ou `@ts-ignore`
- Si les tests échouent : corriger le code ou le test
- Si la couverture est insuffisante : ajouter des tests pour atteindre 40%+

## Bonnes pratiques
- Toujours lancer ces vérifications avant de push
- Corriger les erreurs dans l'ordre : format → lint → types → tests → build
- Ne jamais désactiver un test pour faire passer la CI
- Ne jamais réduire les seuils de couverture pour faire passer la CI
- Si un test est flaky : le marquer et investiguer, ne pas l'ignorer
