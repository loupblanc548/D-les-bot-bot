# Skill: environment-setup

## Nom
Environment Setup — Installation, variables environnement, Docker, configuration locale

## Description
Automatisation de la configuration de l'environnement de développement : installation des dépendances, variables d'environnement, Docker et configuration locale.

## Quand l'utiliser
- Configuration d'un nouvel environnement de développement
- Onboarding d'un nouveau développeur
- Réinitialisation de l'environnement local
- Configuration de Docker pour le développement

## Déclencheurs
- "environment setup"
- "configuration locale"
- "installation"
- "setup"
- "docker setup"
- "onboarding"
- "initialisation"

## Prérequis
- Node.js 20+ installé
- Docker installé (pour PostgreSQL et Redis)
- Git installé
- Accès au repository

## Étapes détaillées

### 1. Installation des dépendances
```bash
npm install
```
- Vérifier que `package-lock.json` est utilisé
- Si erreur : supprimer `node_modules/` et `package-lock.json`, puis `npm install`

### 2. Variables d'environnement
- Copier `.env.example` vers `.env`
- Configurer les variables requises :
  - `DISCORD_TOKEN` : token du bot Discord
  - `DISCORD_CLIENT_ID` : ID client du bot
  - `DISCORD_GUILD_ID` : ID du serveur (pour les commandes de dev)
  - `OWNER_ID` : ID du propriétaire
  - `DATABASE_URL` : URL PostgreSQL
  - Variables des salons Discord (STEAM_EPIC_CHANNEL_ID, etc.)
  - `OPENROUTER_API_KEY` : clé API IA
- Vérifier que `.env` est dans `.gitignore`

### 3. Docker
- Démarrer PostgreSQL et Redis avec Docker :
```bash
docker-compose up -d postgres redis
```
- Vérifier PostgreSQL : `pg_isready -U discord_bot`
- Vérifier Redis : `redis-cli ping`
- Alternative sans Docker : installer PostgreSQL 16 et Redis 7 localement

### 4. Configuration locale
- Générer le client Prisma :
```bash
npx prisma generate
```
- Appliquer les migrations :
```bash
npx prisma migrate dev
```
- Enregistrer les commandes Discord :
```bash
npm run register
```
- Configurer les hooks Git :
```bash
npm run prepare
```

### 5. Vérification
- Démarrer le bot : `npm start`
- Vérifier le health check : `curl http://localhost:3000/health`
- Vérifier que le bot est en ligne sur Discord
- Tester une commande : `/status`

## Commandes exécutables
```bash
npm install                           # Installer les dépendances
cp .env.example .env                  # Copier le template .env
docker-compose up -d postgres redis   # Démarrer DB et cache
npx prisma generate                   # Générer Prisma
npx prisma migrate dev                # Appliquer les migrations
npm run register                      # Enregistrer les commandes
npm run prepare                       # Configurer Husky
npm start                             # Démarrer le bot
curl http://localhost:3000/health     # Health check
```

## Vérifications finales
- [ ] `npm install` a réussi
- [ ] `.env` est configuré avec les vraies valeurs
- [ ] PostgreSQL est accessible
- [ ] Redis est accessible
- [ ] `npx prisma generate` a réussi
- [ ] `npx prisma migrate dev` a réussi
- [ ] Les commandes Discord sont enregistrées
- [ ] Le bot démarre et est en ligne sur Discord
- [ ] Le health check répond 200

## Gestion des erreurs
- Si `npm install` échoue : vérifier la version Node.js (20+)
- Si Docker ne démarre pas : vérifier que Docker Desktop est en cours d'exécution
- Si Prisma échoue : vérifier `DATABASE_URL` et que PostgreSQL est démarré
- Si le bot ne démarre pas : vérifier `DISCORD_TOKEN` et la connexion DB
- Si les commandes ne s'enregistrent pas : vérifier `DISCORD_CLIENT_ID` et `DISCORD_GUILD_ID`

## Bonnes pratiques
- Utiliser Docker pour PostgreSQL et Redis (évite l'installation locale)
- Ne jamais commiter `.env` (seulement `.env.example`)
- Vérifier le health check après configuration
- Utiliser `npm run dev` pour le développement (avec inspect)
- Garder `.env.example` à jour avec toutes les nouvelles variables
