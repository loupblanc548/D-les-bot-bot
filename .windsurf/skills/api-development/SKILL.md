# Skill: api-development

## Nom
API Development — Créer ou modifier une API

## Description
Création ou modification d'APIs backend pour le bot Discord : routes, contrôleurs, validation, gestion d'erreurs et documentation. Adapté aux routes Express du backend.

## Quand l'utiliser
- Ajout d'une nouvelle route API dans `src/backend/routes/`
- Modification d'une route existante
- Création d'un nouvel endpoint pour le dashboard
- Ajout d'une API web pour intégration externe

## Déclencheurs
- "api development"
- "nouvelle route"
- "nouvel endpoint"
- "créer une api"
- "modifier l'api"
- "backend route"

## Prérequis
- Comprendre la structure backend (`src/backend/routes/`, `src/backend/middleware/`, `src/backend/types.ts`)
- Express disponible via `@bull-board/express`
- Prisma client généré
- Zod pour la validation

## Étapes détaillées

### 1. Routes
- Créer la route dans `src/backend/routes/` en suivant le pattern existant
- Définir les méthodes HTTP (GET, POST, PUT, DELETE)
- Utiliser les types définis dans `src/backend/types.ts`
- Enregistrer la route dans le serveur de contrôle (`src/control-server.ts`)

### 2. Contrôleurs
- Séparer la logique métier dans les services (`src/services/`)
- Les routes ne doivent contenir que la logique HTTP (parsing, validation, réponse)
- Utiliser les services existants plutôt que de dupliquer la logique
- Gérer l'async/await correctement

### 3. Validation
- Valider toutes les entrées avec Zod
- Définir un schéma Zod pour chaque endpoint (body, query, params)
- Retourner des erreurs 400 avec des messages clairs si la validation échoue
- Valider les types de retour si nécessaire

### 4. Gestion d'erreurs
- Utiliser try-catch dans chaque handler
- Retourner des codes HTTP appropriés (200, 400, 401, 403, 404, 500)
- Logger les erreurs avec Winston
- Ne pas exposer les stack traces dans les réponses
- Utiliser un middleware d'erreur global si possible

### 5. Documentation
- Documenter chaque endpoint (méthode, URL, paramètres, réponse)
- Ajouter des commentaires JSDoc sur les handlers
- Mettre à jour la documentation API si elle existe

## Commandes exécutables
```bash
npm test                          # Tests
npm run lint                      # Lint
npx tsc --noEmit                  # Type check
npm start                         # Démarrer le bot (inclut le serveur de contrôle)
curl http://localhost:3000/health # Health check
```

## Vérifications finales
- [ ] La route est créée et enregistrée dans le serveur de contrôle
- [ ] Les entrées sont validées avec Zod
- [ ] Les erreurs sont gérées (try-catch, codes HTTP appropriés)
- [ ] La logique métier est dans les services, pas dans les routes
- [ ] Les types TypeScript sont stricts
- [ ] Le lint et les types passent

## Gestion des erreurs
- Si la route n'est pas accessible : vérifier `src/control-server.ts` et le port (3000)
- Si la validation Zod échoue : vérifier le schéma et les types
- Si Prisma renvoie une erreur : vérifier le schéma DB et les types

## Bonnes pratiques
- Suivre le pattern des routes existantes (`dashboard.ts`, `feeds.ts`, `logs.ts`, `metrics.ts`, `settings.ts`)
- Garder les routes minces (thin controllers, fat services)
- Toujours valider avec Zod avant traitement
- Utiliser les codes HTTP standards
- Logger les erreurs avec contexte (Winston)
