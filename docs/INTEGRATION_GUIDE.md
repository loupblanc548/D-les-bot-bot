# Guide d'Intégration John Helldiver - Architecture Complète

Ce guide documente l'intégration complète des modules "John Helldiver" dans le fichier principal `index.ts` (ou `main.ts`).

---

## 📋 Structure des Modules

### Modules Principaux
- **Diagnostic Système** (`src/modules/diagnostic/systemDiagnostic.ts`)
  - Exécution toutes les 24 heures + 5 secondes après démarrage
  - Surveillance RAM, Uptime, pings Discord/Redis/PostgreSQL
  - Output ANSI style Cyberpunk/Terminal BIOS

- **Répondeur Média Hybride** (`src/modules/media/mediaResponder.ts`)
  - Déclenchement sur mention directe (@John Helldiver)
  - 50/50 probabilité : média ou texte militaire
  - Fallback automatique si dossier /media absent

- **Agrégateur RSS Thématique** (`src/modules/rss/aggregator.ts`)
  - Vérification toutes les 15 minutes
  - Embeds stylisés par plateforme (Epic, Steam, PlayStation, Xbox, Nintendo)

- **Système de Rappels** (`src/modules/reminders/`)
  - BullMQ + Redis pour files d'attente
  - QueueEvents pour monitoring
  - Cleanup automatique des jobs

- **IA Contextuelle** (`src/modules/ai/handler.ts`)
  - Mémoire par salon/utilisateur avec TTL 15 min
  - Gestion FIFO des tokens
  - Prompt système John Helldiver

- **Agrégateur Epic Games** (`src/modules/epic/epicGames.ts`)
  - Vérification toutes les 15 minutes
  - Anti-doublon Redis avec TTL 7 jours

---

## 🔧 Intégration dans index.ts

### Code Complet d'Intégration

```typescript
import { Client, GatewayIntentBits } from "discord.js";
import prisma from "./prisma.js";
import logger from "./utils/logger.js";
import { config, validateConfig } from "./config.js";
import { initializeModules, handleMediaResponse } from "./modules/index.js";
import { startMonitoring, runDbSourcesRetrospective, stopMonitoring } from "./services/monitor.js";

// ============================================================
// INITIALISATION DU CLIENT DISCORD
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

// ============================================================
// VALIDATION DE LA CONFIGURATION
// ============================================================

try {
  validateConfig();
} catch (error) {
  console.error("❌ Configuration invalide:", error);
  process.exit(1);
}

// ============================================================
// ÉVÉNEMENT : CLIENT READY
// ============================================================

client.once("ready", async () => {
  logger.info(`✅ Bot connecté en tant que ${client.user?.tag}`);
  logger.info(`🌐 Prêt à surveiller ${client.guilds.cache.size} serveurs`);

  try {
    // 1. Initialisation des modules (Diagnostic, RSS, Epic Games, Reminders)
    initializeModules(client);
    logger.info("📦 Modules initialisés");

    // 2. Démarrage de la surveillance des flux (monitor.ts)
    startMonitoring(client);
    logger.info("👁️ Surveillance activée");

    // 3. Rétrospective DB au démarrage (rattrapage sources personnelles)
    await runDbSourcesRetrospective(client);
    logger.info("🔄 Rétrospective DB terminée");

  } catch (error) {
    logger.error("❌ Erreur lors de l'initialisation:", error);
  }
});

// ============================================================
// ÉVÉNEMENT : MESSAGE CREATE (Répondeur Média)
// ============================================================

client.on("messageCreate", async (message) => {
  try {
    // Répondeur média hybride (mention directe uniquement)
    await handleMediaResponse(client, message);
  } catch (error) {
    logger.error("[MessageCreate] Erreur:", error);
  }
});

// ============================================================
// GESTION DES SIGNAUX D'ARRÊT (SIGTERM / SIGINT)
// ============================================================

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`🛑 Signal ${signal} reçu - Arrêt gracieux en cours...`);

  try {
    // 1. Arrêt de la surveillance des flux
    stopMonitoring();
    logger.info("👁️ Surveillance arrêtée");

    // 2. Fermeture de la connexion Prisma
    await prisma.$disconnect();
    logger.info("🗄️ Connexion Prisma fermée");

    // 3. Déconnexion du client Discord
    await client.destroy();
    logger.info("🤖 Client Discord déconnecté");

    logger.info("✅ Arrêt gracieux terminé");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Erreur lors de l'arrêt gracieux:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ============================================================
// GESTION DES ERREURS NON CAPTURÉES
// ============================================================

process.on("uncaughtException", (error) => {
  logger.error("❌ Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

// ============================================================
// CONNEXION DU BOT
// ============================================================

client.login(config.discordToken);
```

---

## 📦 Variables d'Environnement Requises

### Variables Essentielles
```env
# Discord
DISCORD_TOKEN="votre_token_discord"
DISCORD_CLIENT_ID="votre_client_id"

# Base de données
DATABASE_URL="postgresql://user:password@host:port/db?schema=public"

# Redis
REDIS_URL="redis://redis:6379"
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD=""

# Salons Discord
LOG_CHANNEL_ID="votre_channel_id_logs"
EPIC_GAMES_CHANNEL_ID="1504932229795549385"

# OpenRouter AI
OPENROUTER_API_KEY="votre_cle_api"
OPENROUTER_MODEL="openai/gpt-4o"
AI_SYSTEM_PROMPT="Tu es John Helldiver, soldat d'élite de Super Earth..."
```

---

## 🚀 Séquence de Démarrage

1. **Validation de la configuration** - Vérification des variables d'environnement
2. **Connexion Discord** - Authentification auprès de l'API Discord
3. **Événement `ready`** - Bot connecté et opérationnel
4. **Initialisation des modules** - Diagnostic, RSS, Epic Games, Reminders
5. **Démarrage surveillance** - Activation du monitoring des flux
6. **Rétrospective DB** - Rattrapage des sources personnelles (YouTube, Twitter, Bluesky)
7. **Diagnostic initial** - Exécution 5 secondes après démarrage

---

## 🛑 Séquence d'Arrêt (Graceful Shutdown)

1. **Réception du signal** - SIGTERM ou SIGINT
2. **Arrêt surveillance** - Désactivation du monitoring des flux
3. **Fermeture Prisma** - Déconnexion de la base PostgreSQL
4. **Déconnexion Discord** - Fermeture propre de la connexion WebSocket
5. **Exit propre** - Code de sortie 0 (succès)

---

## 🔒 Sécurité Anti-Crash

### Diagnostic Système
- Capture d'erreurs isolée par module
- Alertes ANSI pour RAM > 85% ou ping > 250ms
- Continue même si une métrique échoue

### Répondeur Média
- Fallback automatique si dossier /media absent
- Capture d'erreurs avec fallback texte
- Ne bloque jamais le démarrage

### Rétrospective DB
- `upsert()` au lieu de `create()` pour éviter les doublons
- `continue` en cas d'erreur de clé étrangère
- Log explicite des erreurs sans crash

---

## 📊 Architecture des Connexions

### Partage des Connexions
- **Prisma** : Instance unique partagée via `prisma.js`
- **Redis** : Instance unique par module (ioredis)
- **Discord** : Instance unique `client` passée aux modules

### Gestion des Sockets
- Pas de saturation des sockets sur Railway
- Fermeture propre via SIGTERM/SIGINT
- Reprise automatique des jobs BullMQ au redémarrage

---

## 🧪 Tests de Fonctionnement

### Test du Diagnostic
```bash
# Le diagnostic s'exécute automatiquement 5 secondes après démarrage
# Vérifiez le salon LOG_CHANNEL_ID pour le rapport ANSI
```

### Test du Répondeur Média
```bash
# Mentionnez le bot dans un salon : @John Helldiver
# Devrait répondre avec média (50%) ou texte (50%)
```

### Test de la Rétrospective
```bash
# La rétrospective s'exécute au démarrage
# Vérifiez les logs pour "RÉTROSPECTIVE DB"
```

---

## 📝 Notes Importantes

1. **Modules ES** - Tous les modules utilisent `import/export` (type: "module" dans package.json)
2. **Discord.js v13** - Utilisation de `MessageEmbed` (pas `EmbedBuilder`)
3. **Railway** - Limite RAM de 380 Mo respectée dans le diagnostic
4. **Redis Cloud** - Instance "Régis" pour files d'attente et cache
5. **Neon PostgreSQL** - Base de données persistante avec Prisma

---

## 🎯 Prochaines Étapes

1. Configurer les variables d'environnement dans Railway
2. Créer le dossier `/media` à la racine du projet
3. Définir les salons Discord dans les variables d'environnement
4. Tester le déploiement via GitHub Actions
5. Surveiller les logs Railway pour vérifier le démarrage

---

**Dernière mise à jour** : 20 Juin 2026
**Version** : 2.0 - Architecture Complète
