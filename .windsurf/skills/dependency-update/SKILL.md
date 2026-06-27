# Skill: dependency-update

## Nom
Dependency Update — Mise à jour et vérification des dépendances

## Description
Mise à jour sécurisée des dépendances npm avec vérification des conflits, des breaking changes et de la compatibilité avec le projet.

## Quand l'utiliser
- Mise à jour mensuelle des dépendances
- Correction d'une vulnérabilité dans une dépendance
- PR Dependabot à valider
- Migration vers une nouvelle version majeure

## Déclencheurs
- "mettre à jour les dépendances"
- "update dependencies"
- "npm update"
- "dependabot"
- "vulnérabilité"
- "upgrade"

## Prérequis
- `package-lock.json` à jour
- Tests passants avant la mise à jour
- Comprendre les contraintes de version (TypeScript 6, Node.js 20, Prisma 5)

## Étapes détaillées

### 1. Vérifier l'état actuel
- Lister les dépendances obsolètes : `npm outdated`
- Vérifier les vulnérabilités : `npm audit`
- Lancer les tests de référence : `npm test`

### 2. Mettre à jour
- Pour les mises à jour patch/minor : `npm update`
- Pour une mise à jour spécifique : `npm install <package>@<version>`
- Pour les mises à jour majeures : vérifier le changelog de la librairie
- Regénérer Prisma si `@prisma/client` ou `prisma` est mis à jour : `npx prisma generate`

### 3. Vérifier les conflits
- Vérifier `npm ls` pour les conflits de version
- Vérifier les peer dependencies
- Si conflit : résoudre manuellement dans `package.json`

### 4. Tester
- Lancer les tests : `npm test`
- Vérifier les types : `npx tsc --noEmit`
- Vérifier le lint : `npm run lint`
- Vérifier le build : `npm run build`
- Si Discord.js est mis à jour : tester l'enregistrement des commandes

### 5. Valider
- Vérifier le démarrage du bot : `npm start` (en local)
- Vérifier les connexions DB et Redis
- Si Playwright est mis à jour : `npx playwright install`

## Commandes exécutables
```bash
npm outdated                    # Lister les paquets obsolètes
npm audit                       # Vérifier les vulnérabilités
npm update                      # Mettre à jour (patch/minor)
npm install <pkg>@<version>     # Installer une version spécifique
npx prisma generate             # Régénérer Prisma
npm test                        # Tests
npx tsc --noEmit                # Type check
npm run build                   # Build
```

## Vérifications finales
- [ ] `npm audit` ne montre pas de vulnérabilités critiques
- [ ] Tous les tests passent
- [ ] `npx tsc --noEmit` passe
- [ ] Le bot démarre correctement
- [ ] `package-lock.json` est commité

## Gestion des erreurs
- Si une mise à jour majeure casse le build : consulter la migration guide de la lib
- Si Prisma casse : vérifier les breaking changes dans la doc Prisma
- Si Discord.js casse : vérifier le changelog et les changements d'API
- Si TypeScript casse : le `tsconfig.json` peut nécessiter des ajustements

## Bonnes pratiques
- Ne jamais mettre à jour plusieurs dépendances majeures en même temps
- Toujours tester après chaque mise à jour
- Vérifier les `ignore` dans `dependabot.yml` (TypeScript major est ignoré)
- Commiter le `package-lock.json` après chaque mise à jour
