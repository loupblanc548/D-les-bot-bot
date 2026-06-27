# Skill: feature-implementation

## Nom
Feature Implementation — Analyse, plan, développement, test, intégration

## Description
Workflow complet pour implémenter une nouvelle fonctionnalité dans le bot Discord, de l'analyse du besoin à la vérification d'intégration.

## Quand l'utiliser
- Ajout d'une nouvelle commande Discord
- Création d'un nouveau service ou manager
- Ajout d'un cron job
- Implémentation d'un nouveau module
- Ajout d'une fonctionnalité de modération, surveillance ou gaming

## Déclencheurs
- "ajouter une fonctionnalité"
- "implémenter"
- "nouvelle commande"
- "nouveau service"
- "ajouter un cron"
- "create feature"
- "implement"

## Prérequis
- Comprendre l'architecture modulaire du projet (`src/commands/`, `src/services/`, `src/cron/`, `src/events/`)
- Schéma Prisma à jour si la feature nécessite de la persistance
- Variables d'environnement nécessaires ajoutées à `.env.example`

## Étapes détaillées

### 1. Analyser le besoin
- Identifier si la feature nécessite : une commande, un service, un cron, un event, ou une combinaison
- Déterminer si de nouveaux modèles Prisma sont nécessaires
- Vérifier si un service existant peut être étendu (`src/services/`)
- Identifier les dépendances externes (API, DB, Redis)

### 2. Créer un plan
- Lister les fichiers à créer/modifier
- Définir le schéma DB si nécessaire (Prisma migration)
- Identifier les tests à écrire
- Vérifier la compatibilité avec l'architecture existante

### 3. Développer
- **Commande Discord** : créer dans `src/commands/` en suivant le pattern existant
- **Service** : créer dans `src/services/` avec injection de dépendances
- **Cron job** : créer dans `src/cron/` avec `node-cron`
- **Event handler** : créer dans `src/events/`
- **Modèle DB** : ajouter au `prisma/schema.prisma` puis `npx prisma migrate dev`
- Respecter les types stricts TypeScript
- Utiliser Zod pour la validation des entrées utilisateur

### 4. Tester
- Écrire des tests Vitest pour le service/commande
- Tester les cas nominaux et les cas d'erreur
- Vérifier les types : `npx tsc --noEmit`
- Lancer : `npm test`

### 5. Vérifier l'intégration
- Vérifier que la feature s'enregistre correctement dans le routeur de commandes
- Vérifier les interactions avec les services existants
- Lancer le lint : `npm run lint`
- Vérifier le formatage : `npm run format:check`
- Si la feature ajoute une commande : tester l'enregistrement avec `npm run register`

## Commandes exécutables
```bash
npx prisma migrate dev --name <nom>    # Créer une migration
npx prisma generate                     # Régénérer le client
npm run register                        # Enregistrer les commandes Discord
npm test                                # Tests
npm run lint                            # Lint
npx tsc --noEmit                        # Type check
```

## Vérifications finales
- [ ] La feature respecte l'architecture modulaire
- [ ] Les types TypeScript sont stricts (pas de `any`)
- [ ] Les tests couvrent les cas nominaux et d'erreur
- [ ] Le schéma Prisma est à jour si nécessaire
- [ ] `.env.example` est mis à jour si de nouvelles variables sont nécessaires
- [ ] Le lint et le formatage passent

## Gestion des erreurs
- Si la feature nécessite une API externe : gérer les timeouts et retries
- Si la feature touche la modération : vérifier les permissions Discord
- Si la feature utilise Redis : gérer la déconnexion du cache

## Bonnes pratiques
- Suivre le pattern des commandes existantes (structure `export const command`)
- Utiliser les services existants plutôt que de dupliquer la logique
- Ajouter des index Prisma pour les nouvelles colonnes fréquemment requêtées
- Documenter la feature dans le README si elle est user-facing
- Utiliser le `ChannelRouter` pour le routage multi-plateforme
