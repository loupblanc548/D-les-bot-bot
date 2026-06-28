import logger from "./logger.js";

const MEMORY_CHECK_INTERVAL = 3 * 60 * 1000; // 3 min
const MB = 1024 * 1024;
const GC_THRESHOLD_MB = 350; // Trigger GC at 350MB RSS (heap limit is 448MB)

export function startMemoryOptimizer(): NodeJS.Timeout {
  const interval = setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / MB);
    const rssMB = Math.round(mem.rss / MB);

    if (rssMB > GC_THRESHOLD_MB) {
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
  }, MEMORY_CHECK_INTERVAL);

  if (interval.unref) interval.unref();
  return interval;
}
