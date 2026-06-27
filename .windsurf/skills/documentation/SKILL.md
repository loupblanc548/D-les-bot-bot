# Skill: documentation

## Nom
Documentation — README, documentation API, commentaires techniques

## Description
Création et mise à jour de la documentation du projet : README, documentation API, commentaires techniques, guides de déploiement.

## Quand l'utiliser
- Mise à jour du README après une nouvelle feature
- Documentation d'une API backend
- Ajout de commentaires techniques sur du code complexe
- Création d'un guide de déploiement
- Mise à jour de la doc d'architecture

## Déclencheurs
- "documentation"
- "documenter"
- "README"
- "doc API"
- "commentaires"
- "document this"

## Prérequis
- Comprendre la structure du projet et l'architecture
- Connaître les features existantes (README.md, ARCHITECTURE.md)
- Accès aux fichiers de configuration et au schéma Prisma

## Étapes détaillées

### 1. README
- Mettre à jour la liste des fonctionnalités
- Mettre à jour la liste des commandes Discord
- Mettre à jour les variables d'environnement requises
- Mettre à jour les scripts npm disponibles
- Mettre à jour la structure du projet
- Ajouter des badges (CI, versions, couverture)

### 2. Documentation API
- Documenter les routes backend dans `src/backend/routes/`
- Lister les endpoints : dashboard, feeds, logs, metrics, settings
- Documenter les paramètres, réponses et codes d'erreur
- Documenter l'authentification si applicable

### 3. Commentaires techniques
- Ajouter des commentaires JSDoc sur les fonctions publiques complexes
- Documenter les types et interfaces non-évidents
- Expliquer les algorithmes complexes (détection de plateforme, routing)
- Documenter les cron jobs et leur fréquence
- Documenter les services et leur responsabilité

### 4. Guides spécialisés
- Mettre à jour `ARCHITECTURE.md` si l'architecture change
- Mettre à jour `DEPLOYMENT.md` si le déploiement change
- Mettre à jour `CONTRIBUTING.md` si le workflow change
- Créer des guides spécifiques si nécessaire (ex: `FREE_GAMES_SETUP.md`)

### 5. Schéma DB
- Documenter les nouveaux modèles Prisma
- Expliquer les relations entre modèles
- Documenter les index et leur justification

## Commandes exécutables
```bash
npm run format:check              # Vérifier le formatage des docs
npx prisma generate               # Régénérer le client (pour la doc du schema)
```

## Vérifications finales
- [ ] Le README reflète l'état actuel du projet
- [ ] Les commandes Discord sont documentées
- [ ] Les variables d'environnement sont à jour
- [ ] L'architecture est documentée si modifiée
- [ ] Les commentaires techniques expliquent le "pourquoi", pas le "quoi"

## Gestion des erreurs
- Si la doc est obsolète : la mettre à jour plutôt que de la supprimer
- Si une feature n'est plus utilisée : la retirer de la doc

## Bonnes pratiques
- Documenter le "pourquoi" plutôt que le "quoi" (le code explique le "quoi")
- Garder le README concis et à jour
- Utiliser des tableaux pour les commandes et variables d'environnement
- Mettre à jour la doc en même temps que le code (pas après)
- Utiliser le français pour la documentation user-facing (cohérence avec le projet)
