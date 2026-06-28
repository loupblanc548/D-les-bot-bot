/**
 * index.ts — Point d'entrée du bot Discord
 *
 * Délègue au shardManager qui détecte automatiquement si le bot
 * a besoin de sharding (mode single par défaut, mode sharded si FORCE_SHARDING=true).
 *
 * Modules :
 *   - shardManager.ts : Sharding automatique (inspiré de discord-hybrid-sharding)
 *   - bot.ts           : Orchestrateur (main, client, connexions)
 *   - commandRouter.ts : Routeur de commandes
 *   - interactionHandler.ts : Gestionnaires d'interactions
 *   - startup.ts       : Logique de démarrage (ClientReady)
 *   - shutdown.ts      : Arrêt gracieux (SIGINT/SIGTERM)
 */

// ── Node v26 + undici workaround ────────────────────────────────────────────
// undici-patch.cjs is loaded via --require in package.json scripts
// (before tsx and before any ESM imports) to guarantee it runs first.

import { startBot } from "./shardManager.js";

startBot();
