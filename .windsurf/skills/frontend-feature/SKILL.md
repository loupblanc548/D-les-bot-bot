# Skill: frontend-feature

## Nom
Frontend Feature — Création d'une fonctionnalité frontend complète

## Description
Création d'une fonctionnalité frontend complète pour le bot Discord : composants, gestion de state, intégration API, responsive design, accessibilité et tests. Adapté au desktop-app Electron et aux embeds Discord.

## Quand l'utiliser
- Ajout d'une fonctionnalité dans le desktop-app Electron (`desktop-app/`)
- Création d'un nouvel embed Discord complexe
- Ajout d'une page dans le dashboard backend
- Création d'un composant UI réutilisable

## Déclencheurs
- "frontend feature"
- "nouvelle page"
- "nouveau composant"
- "interface"
- "dashboard"
- "embed discord"
- "desktop app"

## Prérequis
- Comprendre la structure du desktop-app (`desktop-app/` avec Electron)
- Comprendre les embeds Discord.js (CommandEmbedBuilder)
- Connaître les routes backend (`src/backend/routes/`)

## Étapes détaillées

### 1. Création des composants
- **Desktop-app** : créer les fichiers HTML/JS/CSS dans `desktop-app/`
- **Embed Discord** : créer le builder d'embed dans `src/utils/` ou `src/components/`
- **Dashboard backend** : créer la route dans `src/backend/routes/` et le rendu associé
- Suivre la structure existante (vanilla JS pour le desktop-app, embeds Discord.js pour le bot)

### 2. Gestion du state
- **Desktop-app** : utiliser le pattern existant (IPC Electron via `preload.js`)
- **Embed Discord** : le state est géré par les services backend
- **Dashboard** : utiliser les endpoints API existants

### 3. Intégration API
- Connecter le frontend aux routes backend (`src/backend/routes/`)
- Utiliser `axios` pour les requêtes HTTP (déjà dans les dépendances)
- Gérer les erreurs et les états de chargement
- Valider les réponses avec Zod si nécessaire

### 4. Responsive design
- **Desktop-app** : s'adapter aux différentes tailles de fenêtre Electron
- **Embed Discord** : les embeds Discord sont nativement responsive
- **Dashboard** : utiliser CSS media queries pour mobile/tablette/desktop

### 5. Accessibilité
- Utiliser des balises HTML sémantiques dans le desktop-app
- Ajouter des `aria-label` sur les éléments interactifs
- Vérifier le contraste des couleurs
- Assurer la navigation clavier

### 6. Tests
- Tester les embeds Discord avec des tests Vitest
- Tester les routes backend avec des tests d'intégration
- Tester le desktop-app manuellement (Electron)

## Commandes exécutables
```bash
npm test                              # Tests Vitest
npm run lint                          # Lint
npx tsc --noEmit                      # Type check
cd desktop-app && npm start           # Démarrer le desktop-app (Electron)
```

## Vérifications finales
- [ ] Les composants sont créés et fonctionnels
- [ ] L'intégration API fonctionne
- [ ] Le responsive design est vérifié
- [ ] L'accessibilité est testée
- [ ] Les tests passent
- [ ] Le lint et les types passent

## Gestion des erreurs
- Si l'API backend ne répond pas : vérifier les routes dans `src/backend/routes/`
- Si le desktop-app ne démarre pas : vérifier les dépendances Electron
- Si les embeds Discord sont mal formés : vérifier la structure avec discord.js v14

## Bonnes pratiques
- Suivre le pattern des embeds existants (couleurs, footer, thumbnail configurables via GuildConfig)
- Utiliser le `ChannelRouter` pour le routage multi-plateforme
- Garder le desktop-app léger (Electron)
- Valider toutes les entrées utilisateur avec Zod
