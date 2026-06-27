# Skill: component-generator

## Nom
Component Generator — Créer des composants réutilisables

## Description
Génération de composants réutilisables : embeds Discord, composants desktop-app Electron, utilitaires de rendu. Structure propre, typage TypeScript, documentation et tests.

## Quand l'utiliser
- Création d'un nouvel embed Discord réutilisable
- Création d'un composant UI pour le desktop-app
- Création d'un utilitaire de rendu partagé

## Déclencheurs
- "component generator"
- "créer un composant"
- "nouvel embed"
- "composant réutilisable"
- "generate component"

## Prérequis
- Comprendre les embeds Discord.js v14 (EmbedBuilder)
- Comprendre la structure du desktop-app (`desktop-app/js/`, `desktop-app/css/`)
- TypeScript strict activé

## Étapes détaillées

### 1. Structure propre
- **Embed Discord** : créer dans `src/components/` (déjà existant)
- **Desktop-app** : créer dans `desktop-app/js/components/`
- Suivre le pattern des composants existants
- Séparer la logique du rendu

### 2. Typage TypeScript
- Définir des interfaces pour les props/paramètres du composant
- Utiliser les types Prisma générés si le composant affiche des données DB
- Pas de `any` — utiliser des types précis
- Exporter les types pour la réutilisation

### 3. Documentation
- Ajouter un commentaire JSDoc décrivant le composant
- Documenter les paramètres et le rendu attendu
- Ajouter un exemple d'utilisation en commentaire

### 4. Tests
- **Embed Discord** : tester avec Vitest (vérifier la structure, les champs, les couleurs)
- **Desktop-app** : test manuel via Electron
- Tester les cas nominaux et les cas d'erreur (données manquantes)

## Commandes exécutables
```bash
npm test -- src/components/    # Tests des composants
npm run lint                   # Lint
npx tsc --noEmit               # Type check
```

## Vérifications finales
- [ ] Le composant a une structure propre
- [ ] Le typage TypeScript est strict (pas de `any`)
- [ ] Le composant est documenté (JSDoc)
- [ ] Les tests couvrent les cas nominaux et d'erreur
- [ ] Le composant est réutilisable (pas de logique spécifique à un cas)

## Gestion des erreurs
- Si l'embed Discord dépasse les limites : réduire le contenu (6000 chars max, 25 fields max)
- Si le composant desktop-app ne s'affiche pas : vérifier le HTML et le CSS lié

## Bonnes pratiques
- Centraliser les couleurs via GuildConfig (embedColor, embedFooter)
- Utiliser `EmbedBuilder` de discord.js v14
- Garder les composants petits et focalisés (single responsibility)
- Exporter les interfaces de props pour la réutilisation
