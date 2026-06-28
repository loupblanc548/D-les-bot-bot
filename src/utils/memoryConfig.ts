/**
 * memoryConfig.ts — Single source of truth for all memory thresholds.
 *
 * Railway free tier: 512MB container RAM.
 * V8 heap limit: --max-old-space-size=448 (set in Dockerfile/package.json).
 * GC triggers at 350MB RSS to leave headroom before the 448MB V8 limit.
 *
 * Alert levels (based on % of GC_THRESHOLD_MB):
 *   < 70%  → OK          (< 245 MB)
 *   70-90% → Surveillance (245–315 MB)
 *   90-100% → Warning    (315–350 MB)
 *   ≥ 100% → Critical    (≥ 350 MB)
 */

export const MEMORY_CONFIG = {
  /** Container RAM on Railway (free tier = 512MB) */
  RAILWAY_RAM_MB: 512,

  /** V8 heap limit set via --max-old-space-size */
  V8_HEAP_LIMIT_MB: 448,

  /** RSS threshold (in MB) at which GC is forced */
  GC_THRESHOLD_MB: 350,

  /** Check interval in ms */
  CHECK_INTERVAL_MS: 3 * 60 * 1000, // 3 min

  /** Alert level percentages of GC_THRESHOLD_MB */
  LEVELS: {
    OK: 0,
    SURVEILLANCE: 70,
    WARNING: 90,
    CRITICAL: 100,
  },
} as const;

export type MemoryLevel = "OK" | "SURVEILLANCE" | "WARNING" | "CRITICAL";

/**
 * Computes memory usage level based on RSS as a percentage of GC_THRESHOLD_MB.
 */
export function getMemoryLevel(rssMB: number): MemoryLevel {
  const pct = (rssMB / MEMORY_CONFIG.GC_THRESHOLD_MB) * 100;
  if (pct >= MEMORY_CONFIG.LEVELS.CRITICAL) return "CRITICAL";
  if (pct >= MEMORY_CONFIG.LEVELS.WARNING) return "WARNING";
  if (pct >= MEMORY_CONFIG.LEVELS.SURVEILLANCE) return "SURVEILLANCE";
  return "OK";
}

/**
 * Returns a human-readable memory report string.
 */
export function formatMemoryReport(rssMB: number, heapUsedMB: number, heapTotalMB: number): string {
  const pct = ((rssMB / MEMORY_CONFIG.GC_THRESHOLD_MB) * 100).toFixed(1);
  const level = getMemoryLevel(rssMB);
  return [
    `RSS : ${Math.round(rssMB)} MB / ${MEMORY_CONFIG.RAILWAY_RAM_MB} MB`,
    `Heap : ${Math.round(heapUsedMB)} MB / ${MEMORY_CONFIG.V8_HEAP_LIMIT_MB} MB`,
    `Seuil GC : ${MEMORY_CONFIG.GC_THRESHOLD_MB} MB`,
    `Utilisation du seuil GC : ${pct} %`,
    `État : ${level}`,
  ].join("\n");
}
