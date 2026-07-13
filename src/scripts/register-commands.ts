/**
 * register-commands.ts — Script standalone pour enregistrer les commandes slash
 * sur Discord sans démarrer tout le bot.
 *
 * Usage: npx tsx src/scripts/register-commands.ts
 */
import "dotenv/config";
import { registerCommands } from "../commandRouter.js";
import logger from "../utils/logger.js";

async function main(): Promise<void> {
  logger.info("=== Enregistrement des commandes slash ===");
  await registerCommands();
  logger.info("=== Terminé ===");
  process.exit(0);
}

main().catch((err) => {
  logger.error("Erreur fatale:", err);
  process.exit(1);
});
