# Guide d'intégration pour John Helldiver

## Intégration dans index.js

Ajoutez ce code dans votre fichier principal `index.js` ou `src/index.js`:

```javascript
import { Client, GatewayIntentBits } from "discord.js";
import { initializeModules, remindmeCommand, handleAIChat } from "./modules/index.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  initializeModules(client);
});

// Enregistrement de la commande /remindme
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "remindme") {
    const { execute } = await import("./modules/reminders/command.js");
    await execute(interaction);
  }
});

// Gestion des messages pour l'IA
client.on("messageCreate", async (message) => {
  // Remplacez AI_CHANNEL_ID par l'ID du salon dédié à l'IA
  const AI_CHANNEL_ID = process.env.AI_CHANNEL_ID;
  
  if (message.channelId === AI_CHANNEL_ID || message.mentions.has(client.user)) {
    await handleAIChat(client, message);
  }
});

client.login(process.env.DISCORD_TOKEN);
```

## Variables d'environnement requises

Ajoutez ces variables à votre fichier `.env`:

```env
# Redis (déjà existant)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# OpenRouter (déjà existant)
OPENROUTER_API_KEY=votre_cle_api
OPENROUTER_MODEL=openai/gpt-4o
AI_SYSTEM_PROMPT=Tu es John Helldiver, un assistant militaire de Super Earth. Réponds avec un style techno-militaire noir/jaune et sois concis.

# Salons pour RSS
PATCH_CHANNEL_FORTNITE_ID=votre_channel_id
PATCH_CHANNEL_PLAYSTATION_ID=votre_channel_id
PATCH_CHANNEL_STEAM_ID=votre_channel_id
PATCH_CHANNEL_XBOX_ID=votre_channel_id

# Flux RSS (séparez par des virgules pour plusieurs URLs)
PATCH_FORTNITE_RSS=https://www.fortnite.com/rss/news
PATCH_PLAYSTATION_RSS=https://blog.playstation.com/feed/
PATCH_STEAM_RSS=https://store.steampowered.com/feeds/news/
PATCH_XBOX_RSS=https://news.xbox.com/en-us/feed

# Salon IA
AI_CHANNEL_ID=votre_channel_id
```

## Commandes npm install

```bash
npm install bullmq ioredis rss-parser ms
npm install --save-dev @types/ms
```

## Structure des fichiers créés

```
src/modules/
├── reminders/
│   ├── command.ts      # Commande /remindme
│   └── worker.ts       # Worker BullMQ pour les rappels
├── ai/
│   └── handler.ts      # Gestionnaire IA avec mémoire Redis
├── rss/
│   └── aggregator.ts   # Agrégateur RSS avec anti-doublon
├── index.ts            # Point d'entrée des modules
└── INTEGRATION_GUIDE.md # Ce fichier
```
