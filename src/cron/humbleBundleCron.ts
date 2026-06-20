import logger from "../utils/logger.js";
import { fetchHumbleBundleDeals, savePriceHistory } from "../services/humbleBundle.js";

export async function runHumbleBundleCron(): Promise<void> {
  try {
    logger.info("[HumbleBundleCron] Starting cron job");
    const deals = await fetchHumbleBundleDeals();
    if (deals.length > 0) {
      await savePriceHistory(deals);
    }
    logger.info(`[HumbleBundleCron] Completed: ${deals.length} deals processed`);
  } catch (error) {
    logger.error("[HumbleBundleCron] Error:", error);
  }
}
