# Skill: frontend-debug

## Nom
Frontend Debug — Diagnostiquer les erreurs frontend

## Description
Diagnostic des erreurs frontend : erreurs console, problèmes de rendu, bugs d'embeds Discord, problèmes CSS dans le desktop-app Electron.

## Quand l'utiliser
- Un embed Discord ne s'affiche pas correctement
- Le desktop-app Electron a des erreurs console
- Un problème de rendu CSS
- Un bouton ou interaction ne fonctionne pas

## Déclencheurs
- "frontend debug"
- "erreur console"
- "problème de rendu"
- "embed cassé"
- "css bug"
- "rendering issue"

## Prérequis
- DevTools Electron pour le desktop-app
- Accès aux logs Discord pour les embeds
- Comprendre la structure des embeds Discord.js v14

## Étapes détaillées

### 1. Erreurs console
- **Desktop-app** : ouvrir DevTools (Ctrl+Shift+I) et vérifier la console
- **Embeds Discord** : vérifier les logs Winston pour les erreurs d'embed
- Identifier l'erreur et sa source

### 2. Problèmes de rendu
- **Embeds Discord** :
  - Vérifier la longueur du contenu (limite 6000 chars)
  - Vérifier le nombre de fields (limite 25)
  - Vérifier la validité des URLs (images, thumbnails)
  - Vérifier les couleurs (format hexadécimal)
- **Desktop-app** :
  - Vérifier le HTML/CSS
  - Inspecter les éléments avec DevTools
  - Vérifier les computed styles

### 3. Bugs spécifiques
- **Discord.js** : vérifier la version v14 et les breaking changes
- **Electron** : vérifier la compatibilité des APIs Electron
- **CSS** : vérifier les flexbox/grid, les media queries, les z-index

### 4. Corriger
- Appliquer la correction minimale
- Tester après correction
- Vérifier que la correction ne casse pas d'autres rendus

## Commandes exécutables
```bash
cd desktop-app && npm start    # Lancer avec DevTools
npm test                       # Tests
npm run lint                   # Lint
```

## Vérifications finales
- [ ] L'erreur est identifiée et corrigée
- [ ] Le rendu est correct sur toutes les plateformes concernées
- [ ] Aucune régression visuelle
- [ ] Les tests passent

## Gestion des erreurs
- Si l'embed est trop long : tronquer le contenu ou utiliser un field supplémentaire
- Si l'image ne s'affiche pas : vérifier l'URL et le Content-Type
- Si le CSS ne s'applique pas : vérifier la spécificité et l'ordre des règles

## Bonnes pratiques
- Utiliser les DevTools Electron pour le desktop-app
- Tester les embeds sur Discord (mobile et desktop)
- Vérifier les limites Discord (chars, fields, embeds par message)
- Utiliser les couleurs GuildConfig pour la cohérence
