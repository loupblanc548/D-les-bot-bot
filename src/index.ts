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
// undici-patch.cjs is loaded via --require in package.json scripts (npm start, Docker).
// This ESM side-effect import ensures the patch also applies when running with
// `npx tsx src/index.ts` or any other launcher that doesn't use --require.
// It MUST be the first import so ESM evaluates it before discord.js loads.
import "./undici-patch-loader.js";

import { startBot } from "./shardManager.js";

startBot();
