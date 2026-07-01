<!-- Badges -->
<div align="center">

  <!-- CI Badge - Remplacer USER/REPO par votre dépôt GitHub -->
  <img src="https://img.shields.io/github/actions/workflow/status/USER/REPO/.github/workflows/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI%2FCD" alt="CI/CD" />

  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=nodedotjs" alt="Node.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis" alt="Redis" />
  <br/>
  <img src="https://img.shields.io/badge/ESLint-10-4B32C3?style=for-the-badge&logo=eslint" alt="ESLint" />
  <img src="https://img.shields.io/badge/Prettier-3.8-F7B93E?style=for-the-badge&logo=prettier" alt="Prettier" />
  <img src="https://img.shields.io/badge/Vitest-4.1-6E9F18?style=for-the-badge&logo=vitest" alt="Vitest" />
  <img src="https://img.shields.io/badge/Prisma-advanced-2D3748?style=for-the-badge&logo=prisma" alt="Prisma" />
</div>

# Discord Surveillance Bot

Bot de surveillance Discord avancé avec modération, surveillance de sources, IA, et gaming.

## 🚀 Fonctionnalités

### 🛡️ Sécurité & Modération
- **Anti-Raid** : Détection automatique des raids avec cooldown
- **Anti-Phishing** : Détection des liens malveillants
- **Modération** : Ban, kick, mute, timeout, etc.
- **Lockdown** : Mode verrouillage d'urgence
- **Auto-Modération IA** : Détection de spam et contenu haineux

### 📡 Surveillance
- **YouTube** : Surveillance des chaînes YouTube
- **Twitter/X** : Surveillance des comptes Twitter
- **Bluesky** : Surveillance des comptes Bluesky
- **Jeux Gratuits** : Alertes Epic Games, Steam, etc.
- **Mises à jour de jeux** : Suivi des patchs et hotfixs
- **Prix réduits** : Alertes de promotions (-50% ou plus)

### 🤖 Intelligence Artificielle
- **Chat IA** : Conversation avec OpenRouter API
- **Traduction** : Traduction automatique
- **Résumé** : Résumé de textes
- **Smart Polls** : Sondages intelligents

### 🔧 Outils Admin
- **Debug** : Diagnostic complet du bot
- **Hot Reload** : Rechargement sans redémarrage
- **Alertes Intelligentes** : Groupement et escalation
- **Notifications Push** : Telegram pour alertes critiques

---

## 🎮 Routage Multi-Plateforme

Le bot analyse automatiquement le titre de chaque article (deal, patch note, jeu gratuit, tweet gaming) pour détecter la ou les plateformes concernées, puis envoie l'embed dans **tous les salons correspondants**.

### Plateformes détectées

| Plateforme | Mots-clés détectés | Salon `.env` | Couleur embed |
|---|---|---|---|
| **Epic Games** | `[Epic Games]`, `[Epic Game]`, `epic` + `free`/`gratuit` | `STEAM_EPIC_CHANNEL_ID` | `#2A2A2A` (noir) |
| **Steam** | `[Steam]`, `steam`, `GOG` | `STEAM_EPIC_CHANNEL_ID` | `#000080` (bleu marine) |
| **PlayStation** | `[PS5]`, `[PS4]`, `PSN`, `playstation` | `PLAYSTATION_CHANNEL_ID` | `#003791` (bleu royal) |
| **Xbox** | `[Xbox Series]`, `[XBL]`, `Xbox`, `Microsoft` | `XBOX_CHANNEL_ID` | `#107C10` (vert émeraude) |
| **Nintendo** | `[Switch]`, `[Nintendo]` | `NINTENDO_CHANNEL_ID` | `#E60012` (rouge Switch) |

### Fonctionnement

- **Détection par word boundary** : `\bsteam\b` détecte « Steam » mais pas « Steaming »
- **Multi-plateforme** : Un article `[Steam] [PS5]` est posté dans les salons Steam/Epic **et** PlayStation
- **Déduplication** : Une même plateforme n'est jamais notifiée deux fois
- **Fallback** : Si aucune plateforme n'est détectée, l'article est envoyé dans le salon Steam/Epic par défaut
- **Silencieux** : Si un salon n'est pas configuré (`.env` vide), la plateforme est ignorée

### Cron jobs utilisant le routage

| Cron | Source | Fréquence |
|---|---|---|
| `dealsCron` | Flux RSS Reddit r/GameDeals | Toutes les 10 min |
| `freeGamesCron` | Flux RSS r/FreeGameFindings | Toutes les 15 min |
| `steamNewsCron` | Flux RSS Steam News | Toutes les 5 min |
| `globalPatchNotesCron` | Multi-flux RSS gaming | Toutes les 30 min |
| `twitterCron` | Comptes Twitter/X gaming | Toutes les 15 min |

---

## ⏱️ Barrière Temporelle 48h

Tous les crons utilisant des flux RSS (`dealsCron`, `freeGamesCron`, `steamNewsCron`, `globalPatchNotesCron`, `twitterCron`) appliquent une **barrière de 48 heures** :

- Seuls les articles publiés il y a **moins de 48h** sont traités
- Les articles plus anciens sont **ignorés silencieusement**
- **Protection anti-repost** : après un reset de base de données, le bot ne re-postera pas des centaines d'anciens articles

---

## 📦 Installation

### Prérequis
- Node.js 18+
- npm ou yarn
- Compte Discord avec bot token
- PostgreSQL (ou SQLite pour le développement)

### Étapes

1. **Cloner le repository**
```bash
git clone <repository-url>
cd bot
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer les variables d'environnement**
```bash
cp .env.example .env
# Éditer .env avec vos configurations
```

4. **Initialiser la base de données**
```bash
npx prisma generate
npx prisma db push
```

5. **Enregistrer les commandes Discord**
```bash
npm run register-commands
```

6. **Démarrer le bot**
```bash
npm start
```

## 🔧 Configuration

### Variables d'environnement requises

```env
# Discord
DISCORD_TOKEN=votre_token_ici
DISCORD_CLIENT_ID=votre_client_id
DISCORD_GUILD_ID=votre_guild_id
OWNER_ID=votre_user_id

# Base de données
DATABASE_URL="postgresql://discord_bot:discord_bot@localhost:5432/discord_bot?schema=public"

# 🎮 Salons Discord par plateforme (routage automatique)
STEAM_EPIC_CHANNEL_ID=channel_id    # Steam + Epic Games
PLAYSTATION_CHANNEL_ID=channel_id   # PS4, PS5, PSN
XBOX_CHANNEL_ID=channel_id          # Xbox Series, One, XBL, Microsoft
NINTENDO_CHANNEL_ID=channel_id      # Switch, eShop

# Salons spécialisés
FORTNITE_CHANNEL_ID=channel_id
INSTANT_GAMING_CHANNEL_ID=channel_id
LOG_CHANNEL_ID=channel_id

# IA
OPENROUTER_API_KEY=votre_cle_ici

# Surveillance
TWITTER_ACCOUNTS=compte1,compte2
TWITCH_CLIENT_ID=client_id
TWITCH_CLIENT_SECRET=client_secret

# Telegram (optionnel)
TELEGRAM_BOT_TOKEN=bot_token
TELEGRAM_CHAT_ID=chat_id
```

> 💡 **Note** : L'ancien `FREE_GAMES_CHANNEL_ID` est **déprécié**. Les jeux gratuits sont maintenant routés automatiquement vers les salons par plateforme.

## 📚 Commandes

### Commandes Principales
- `/help` - Affiche l'aide
- `/status` - Statut du bot
- `/debug` - Diagnostic complet
- `/hotreload` - Gestion du hot reload

### Commandes de Surveillance
- `/addsource [@handle] [plateforme]` - Ajouter une source
- `/removesource [id]` - Supprimer une source
- `/listsources` - Lister les sources

### Commandes de Modération
- `/ban [@user] [raison]` - Bannir un utilisateur
- `/kick [@user] [raison]` - Expulser un utilisateur
- `/mute [@user] [durée]` - Rendre muet
- `/timeout [@user] [durée]` - Timeout
- `/lockdown` - Mode verrouillage
- `/antiraid` - Configurer l'anti-raid
- `/antiphishing` - Configurer l'anti-phishing
- `/linkcheck` - Vérifier les liens d'un message

### Commandes Gaming
- `/free-games` - Jeux gratuits actuels (manuel ; les alertes automatiques utilisent le routage multi-plateforme)
- `/game-status [jeu]` - Statut d'un jeu
- `/deal` - Meilleures offres

## 🛠️ Développement

### Scripts disponibles

```bash
npm start          # Démarrer le bot
npm test           # Lancer les tests
npm run build      # Compiler le projet
npm run lint       # Linter
npm run register-commands  # Enregistrer les commandes
```

### Structure du projet

```
src/
├── commands/       # Commandes Discord
│   └── security/   # Module de sécurité (anti-raid, anti-phishing, etc.)
├── services/       # Services métier
├── events/         # Gestionnaires d'événements
├── utils/          # Utilitaires
├── cron/           # Tâches planifiées (deals, free games, Twitter, Steam, etc.)
├── config.ts       # Configuration centralisée
└── index.ts        # Point d'entrée
```

### Tests

Les tests sont écrits avec Vitest :

```bash
npm test
```

## 🔍 Monitoring

### Health Check

Le bot effectue automatiquement un health check au démarrage :

- ✅ Configuration Discord
- ✅ Connexion base de données
- ✅ Salons Discord
- ✅ Services externes
- ✅ Fichiers requis

### Alertes

Le bot utilise un système d'alertes intelligentes :

- **Cooldown** : Délai de silence configurable
- **Escalation** : Augmentation automatique de sévérité
- **Groupement** : Regroupement des alertes similaires
- **Notifications Push** : Telegram pour alertes critiques

## 📈 Performance

### Optimisations

- **Redis Cache** : Cache des réponses API
- **Connection Pooling** : Pool de connexions Prisma
- **Rate Limiting** : Limitation des requêtes
- **Cleanup** : Nettoyage automatique de la mémoire

### Métriques

- Uptime du bot
- Utilisation mémoire
- Latence Discord
- Taux de succès des API

## 🤝 Contribution

Les contributions sont les bienvenues !

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT.

## 🆘 Support

Pour le support, rejoignez le serveur Discord ou ouvrez une issue sur GitHub.

## 🙏 Remerciements

- Discord.js pour la librairie Discord
- Prisma pour l'ORM
- devin GLM.5.2 et freebfuff deepseekv4 pro 
- La communauté pour le suppor
