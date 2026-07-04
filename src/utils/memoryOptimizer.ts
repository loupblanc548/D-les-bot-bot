import logger from "./logger.js";
import { MEMORY_CONFIG, getMemoryLevel } from "./memoryConfig.js";

const MB = 1024 * 1024;

export function startMemoryOptimizer(): NodeJS.Timeout {
  const interval = setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / MB);
    const heapTotalMB = Math.round(mem.heapTotal / MB);
    const rssMB = Math.round(mem.rss / MB);
    const level = getMemoryLevel(rssMB);

    // Log status only when worth it (SURVEILLANCE+)
    if (level !== "OK") {
      logger.info(
        `[Memory] RSS: ${rssMB}MB | Heap: ${heapUsedMB}/${heapTotalMB}MB | Level: ${level}`,
      );
    }

    if (rssMB > MEMORY_CONFIG.GC_THRESHOLD_MB) {
      logger.warn(
        `[Memory] ⚠️ RSS ${rssMB}MB > seuil ${MEMORY_CONFIG.GC_THRESHOLD_MB}MB — forçage GC`,
      );

      if (global.gc) {
        global.gc();
        const after = process.memoryUsage();
        const afterRSS = Math.round(after.rss / MB);
        const afterHeap = Math.round(after.heapUsed / MB);
        const savedRSS = rssMB - afterRSS;
        const savedHeap = heapUsedMB - afterHeap;
        logger.info(
          `[Memory] ✅ GC forcé — RSS: ${rssMB}MB→${afterRSS}MB (-${savedRSS}MB) | Heap: ${heapUsedMB}MB→${afterHeap}MB (-${savedHeap}MB)`,
        );
      } else {
        logger.warn(
          `[Memory] ❌ GC non disponible — relancer avec --expose-gc pour activer le forçage`,
        );
      }
    }
  }, MEMORY_CONFIG.CHECK_INTERVAL_MS);

  if (interval.unref) interval.unref();
  return interval;
}
