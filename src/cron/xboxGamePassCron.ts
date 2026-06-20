import logger from "../utils/logger.js";
import { fetchXboxGamePassGames, savePriceHistory } from "../services/xboxGamePass.js";

export async function runXboxGamePassCron(): Promise<void> {
  try {
    logger.info("[XboxGamePassCron] Starting cron job");
    const games = await fetchXboxGamePassGames();
    if (games.length > 0) {
      await savePriceHistory(games);
    }
    logger.info(`[XboxGamePassCron] Completed: ${games.length} games processed`);
  } catch (error) {
    logger.error("[XboxGamePassCron] Error:", error);
  }
}
