import logger from "./logger.js";
import { MEMORY_CONFIG } from "./memoryConfig.js";

const MB = 1024 * 1024;

export function startMemoryOptimizer(): NodeJS.Timeout {
  const interval = setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / MB);
    const rssMB = Math.round(mem.rss / MB);

    if (rssMB > MEMORY_CONFIG.GC_THRESHOLD_MB) {
      logger.warn(`[Memory] RSS élevé: ${rssMB}MB — forçage GC`);
      if (global.gc) {
        global.gc();
        const after = process.memoryUsage();
        logger.info(
          `[Memory] GC forcé — RSS: ${rssMB}MB→${Math.round(after.rss / MB)}MB, Heap: ${heapUsedMB}MB→${Math.round(after.heapUsed / MB)}MB`,
        );
      } else {
        logger.warn(`[Memory] GC non disponible (lancer avec --expose-gc)`);
      }
    }
  }, MEMORY_CONFIG.CHECK_INTERVAL_MS);

  if (interval.unref) interval.unref();
  return interval;
}
