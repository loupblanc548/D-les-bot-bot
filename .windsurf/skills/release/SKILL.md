# Skill: release

## Nom
Release — Versioning, changelog, préparation production

## Description
Préparation d'une release : gestion du versioning, génération du changelog, tag Git, et vérifications pré-production.

## Quand l'utiliser
- Préparation d'une nouvelle release
- Création d'un tag de version
- Génération du changelog
- Déploiement en production

## Déclencheurs
- "release"
- "versioning"
- "changelog"
- "nouvelle version"
- "tag"
- "publish"

## Prérequis
- Tous les tests passent (`npm test`)
- Le build réussit (`npm run build`)
- Le lint et le formatage passent
- Branche main ou master à jour

## Étapes détaillées

### 1. Versioning
- Vérifier la version actuelle dans `package.json` (`"version": "1.0.0"`)
- Déterminer le type de version :
  - **Patch** (1.0.0 → 1.0.1) : bug fixes, corrections mineures
  - **Minor** (1.0.0 → 1.1.0) : nouvelles fonctionnalités rétrocompatibles
  - **Major** (1.0.0 → 2.0.0) : breaking changes
- Mettre à jour la version dans `package.json`
- Mettre à jour la version dans `package-lock.json` : `npm install`

### 2. Changelog
- Lister les changements depuis la dernière release : `git log --oneline <last-tag>..HEAD`
- Catégoriser les changements :
  - **Added** : nouvelles fonctionnalités
  - **Changed** : modifications de fonctionnalités existantes
  - **Deprecated** : fonctionnalités bientôt supprimées
  - **Removed** : fonctionnalités supprimées
  - **Fixed** : bug fixes
  - **Security** : corrections de sécurité
- Utiliser le format Conventional Commits (le projet utilise commitlint)

### 3. Vérifications pré-production
- Lancer tous les tests : `npm test`
- Vérifier le build : `npm run build`
- Vérifier le lint : `npm run lint`
- Vérifier les types : `npx tsc --noEmit`
- Vérifier le build Docker : `docker build -t discord-bot .`

### 4. Tag et release
- Créer un tag Git : `git tag -a v<version> -m "Release v<version>"`
- Pusher le tag : `git push origin v<version>`
- La CI GitHub Actions va automatiquement builder et déployer

### 5. Vérification post-release
- Vérifier que la CI s'est déclenchée sur le tag
- Vérifier que l'image Docker a été publiée
- Vérifier que le déploiement staging/production s'est déclenché

## Commandes exécutables
```bash
git log --oneline <last-tag>..HEAD    # Lister les changements
npm test                               # Tests
npm run build                          # Build
npm run lint                           # Lint
npx tsc --noEmit                       # Type check
docker build -t discord-bot .          # Build Docker
git tag -a v<version> -m "Release v<version>"  # Créer un tag
git push origin v<version>             # Pusher le tag
```

## Vérifications finales
- [ ] La version est mise à jour dans `package.json`
- [ ] Le changelog est généré
- [ ] Tous les tests passent
- [ ] Le build réussit
- [ ] Le tag Git est créé et poussé
- [ ] La CI s'est déclenchée

## Gestion des erreurs
- Si un test échoue : ne pas release — corriger d'abord
- Si le build échoue : ne pas release — corriger d'abord
- Si la CI échoue après le tag : créer un hotfix et un nouveau tag

## Bonnes pratiques
- Suivre le format Conventional Commits (le projet utilise commitlint)
- Ne jamais release un vendredi soir (règle d'or)
- Toujours tester en staging avant la production
- Garder un changelog à jour et lisible
- Versionner de manière sémantique (SemVer)
