import logger from "../utils/logger.js";
import { fetchGMGDeals, savePriceHistory } from "../services/greenManGaming.js";

export async function runGMGCron(): Promise<void> {
  try {
    logger.info("[GMGCron] Starting cron job");
    const deals = await fetchGMGDeals();
    if (deals.length > 0) {
      await savePriceHistory(deals);
    }
    logger.info(`[GMGCron] Completed: ${deals.length} deals processed`);
  } catch (error) {
    logger.error("[GMGCron] Error:", error);
  }
}
