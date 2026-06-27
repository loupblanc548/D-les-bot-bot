# Skill: refactor

## Nom
Refactor — Améliorer le code sans changer le comportement

## Description
Refactoring structuré pour améliorer la qualité, la lisibilité et la maintenabilité du code sans modifier le comportement existant. Les tests doivent rester verts avant et après.

## Quand l'utiliser
- Code dupliqué détecté
- Fonction trop longue ou trop complexe
- Module difficile à maintenir
- Dette technique identifiée
- Amélioration de la typage TypeScript

## Déclencheurs
- "refactor"
- "refactoriser"
- "améliorer ce code"
- "nettoyer le code"
- "dette technique"
- "simplify"

## Prérequis
- Tests existants passants (sinon, en créer d'abord)
- Comprendre le comportement attendu du code à refactorer
- ESLint et TypeScript configurés

## Étapes détaillées

### 1. Analyser
- Identifier le code à refactorer dans `src/`
- Vérifier que des tests couvrent le comportement actuel
- Si pas de tests : en créer avant de refactorer
- Identifier les dépendances et les points d'entrée

### 2. Refactorer par petites étapes
- Extraire les fonctions longues en sous-fonctions
- Extraire le code dupliqué en utilitaires (`src/utils/`)
- Améliorer les types (remplacer `any` par des types précis)
- Simplifier les conditions complexes
- Renommer les variables/fonctions peu claires
- Utiliser les patterns existants du projet

### 3. Vérifier après chaque étape
- Lancer les tests : `npm test`
- Vérifier les types : `npx tsc --noEmit`
- Vérifier le lint : `npm run lint`

### 4. Vérification finale
- Tous les tests passent
- Le comportement est identique
- Le code est plus lisible et maintenable

## Commandes exécutables
```bash
npm test                      # Tests — doivent rester verts
npx tsc --noEmit              # Type check
npm run lint                  # Lint
npm run format:check          # Formatage
```

## Vérifications finales
- [ ] Tous les tests passent (comportement inchangé)
- [ ] `npx tsc --noEmit` passe
- [ ] `npm run lint` passe
- [ ] Le code est plus lisible qu'avant
- [ ] Pas de nouvelle duplication introduite

## Gestion des erreurs
- Si un test échoue après refactoring : le refactoring a changé le comportement — revenir en arrière
- Si les types cassent : corriger les types avant de continuer

## Bonnes pratiques
- Refactorer par petites étapes incrémentales
- Tester après chaque changement
- Ne pas mélanger refactoring et nouvelle feature
- Préserver l'API publique des services
