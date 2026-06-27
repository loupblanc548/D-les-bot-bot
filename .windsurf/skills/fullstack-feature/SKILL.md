# Skill: fullstack-feature

## Nom
Fullstack Feature — Workflow complet frontend + backend + DB + tests + documentation

## Description
Implémentation d'une fonctionnalité fullstack complète : frontend (embeds Discord / desktop-app), backend (services, routes), base de données (Prisma), tests et documentation.

## Quand l'utiliser
- Fonctionnalité nécessitant des modifications sur toutes les couches
- Nouvelle commande Discord avec persistance et interface
- Nouveau module du dashboard avec API et DB
- Fonctionnalité end-to-end

## Déclencheurs
- "fullstack feature"
- "feature complète"
- "end to end"
- "frontend + backend"
- "full stack"

## Prérequis
- Comprendre toute l'architecture du projet
- Prisma, Express, Discord.js, Electron
- Tests Vitest configurés
- Docker pour PostgreSQL et Redis

## Étapes détaillées

### 1. Frontend
- Créer ou modifier les embeds Discord (`src/components/`, `src/commands/`)
- Créer ou modifier le desktop-app (`desktop-app/`) si nécessaire
- Créer ou modifier le dashboard (`src/backend/routes/`)
- Vérifier le responsive et l'accessibilité

### 2. Backend
- Créer ou modifier les services (`src/services/`)
- Créer ou modifier les routes API (`src/backend/routes/`)
- Créer ou modifier les managers (`src/managers/`) si coordination nécessaire
- Créer ou modifier les cron jobs (`src/cron/`) si nécessaire
- Valider les entrées avec Zod

### 3. Base de données
- Modifier `prisma/schema.prisma` si nécessaire
- Créer une migration : `npx prisma migrate dev --name <name>`
- Régénérer le client : `npx prisma generate`
- Ajouter des index si nécessaire
- Vérifier l'intégrité référentielle

### 4. Tests
- Écrire des tests Vitest pour les services
- Écrire des tests pour les commandes
- Écrire des tests pour les routes API
- Vérifier la couverture : `npm run test:ci`
- Tester l'intégration end-to-end

### 5. Documentation
- Mettre à jour le README si la feature est user-facing
- Mettre à jour l'ARCHITECTURE.md si l'architecture change
- Ajouter des commentaires JSDoc sur les fonctions publiques
- Mettre à jour `.env.example` si de nouvelles variables sont nécessaires

## Commandes exécutables
```bash
npx prisma migrate dev --name <name>   # Migration
npx prisma generate                     # Client Prisma
npm test                                # Tests
npm run test:ci                         # Tests + couverture
npm run lint                            # Lint
npx tsc --noEmit                        # Type check
npm run build                           # Build
npm run register                        # Enregistrer les commandes Discord
```

## Vérifications finales
- [ ] Le frontend fonctionne (embeds, desktop-app, dashboard)
- [ ] Le backend fonctionne (services, routes, cron)
- [ ] La DB est à jour (migration appliquée, client généré)
- [ ] Les tests passent avec une couverture suffisante
- [ ] La documentation est à jour
- [ ] Le lint, les types et le build passent
- [ ] `.env.example` est mis à jour si nécessaire

## Gestion des erreurs
- Si le frontend ne reçoit pas les données : vérifier l'API backend et les routes
- Si l'API ne trouve pas les données : vérifier le schéma Prisma et les migrations
- Si les tests échouent : corriger couche par couche (DB → backend → frontend)

## Bonnes pratiques
- Développer couche par couche : DB → backend → frontend
- Tester chaque couche indépendamment avant l'intégration
- Utiliser les services existants pour éviter la duplication
- Garder une séparation claire des responsabilités
- Documenter au fur et à mesure
