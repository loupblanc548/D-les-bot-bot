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

import { startBot } from "./shardManager.js";
import logger from "./utils/logger.js";

// Wrapper anti-crash global — empêche le bot de crasher sur des erreurs non-fatales
async function bootstrap(): Promise<void> {
  try {
    await startBot();
  } catch (err) {
    logger.error("[FATAL] Erreur de démarrage:", err);
    logger.error("[FATAL] Le bot continue en mode dégradé au lieu de crasher");
    // Ne pas process.exit(1) — laisser le bot tourner même en mode dégradé
  }
}

void bootstrap();
