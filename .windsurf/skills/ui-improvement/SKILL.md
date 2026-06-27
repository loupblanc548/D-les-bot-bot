# Skill: ui-improvement

## Nom
UI Improvement — Améliorer l'interface utilisateur

## Description
Amélioration de l'interface utilisateur : UX, design system, cohérence visuelle, responsive, animations et performances. Applicable aux embeds Discord et au desktop-app Electron.

## Quand l'utiliser
- Amélioration de l'UX du desktop-app
- Amélioration des embeds Discord (cohérence visuelle)
- Refonte du design du dashboard
- Optimisation mobile/tablette

## Déclencheurs
- "ui improvement"
- "améliorer l'interface"
- "ux"
- "design"
- "cohérence visuelle"
- "responsive"

## Prérequis
- Comprendre le système d'embeds Discord (couleurs configurables via GuildConfig)
- Comprendre la structure du desktop-app Electron
- Connaître les conventions CSS existantes

## Étapes détaillées

### 1. UX
- Analyser le parcours utilisateur actuel
- Identifier les frictions (trop de clics, informations cachées)
- Proposer des améliorations de flux
- Vérifier la cohérence des retours visuels (loading, success, error)

### 2. Design system
- **Embeds Discord** : vérifier la cohérence des couleurs (embedColor de GuildConfig), des footers, des thumbnails
- **Desktop-app** : vérifier la cohérence des couleurs, typographie, espacements
- Créer ou mettre à jour les variables CSS dans `desktop-app/css/`
- Documenter les couleurs et composants réutilisables

### 3. Cohérence visuelle
- Uniformiser les embeds Discord (même structure, même style de footer)
- Uniformiser les boutons et sélecteurs du desktop-app
- Vérifier la cohérence des icônes et emojis utilisés

### 4. Responsive
- **Desktop-app** : tester différentes tailles de fenêtre
- **Dashboard** : vérifier mobile (360px), tablette (768px), desktop (1200px+)
- **Embeds Discord** : nativement responsive (Discord gère le rendu)

### 5. Animations
- Ajouter des transitions CSS subtiles dans le desktop-app
- Ne pas surcharger d'animations (performance)
- Respecter `prefers-reduced-motion`

### 6. Performances
- Optimiser les images avec `sharp` (déjà dans les dépendances)
- Minimiser les reflows/repaints dans le desktop-app
- Lazy-load les contenus non critiques

## Commandes exécutables
```bash
cd desktop-app && npm start    # Lancer le desktop-app
npm run lint                   # Lint
npm test                       # Tests
```

## Vérifications finales
- [ ] L'UX est améliorée et testée
- [ ] Le design system est cohérent
- [ ] Le responsive est vérifié (mobile, tablette, desktop)
- [ ] Les animations sont subtiles et performantes
- [ ] Aucune régression visuelle

## Gestion des erreurs
- Si les embeds Discord sont incohérents : centraliser la configuration via GuildConfig
- Si le desktop-app est lent : profiler avec les DevTools Electron

## Bonnes pratiques
- Utiliser les couleurs configurables de GuildConfig (embedColor, embedFooter, embedThumbnail)
- Garder les embeds Discord concis (limite de 6000 caractères)
- Tester sur Discord (mobile et desktop) car le rendu diffère
- Préférer des améliorations incrémentales plutôt qu'une refonte complète
