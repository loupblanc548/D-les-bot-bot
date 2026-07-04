/**
 * memoryConfig.ts — Single source of truth for all memory thresholds.
 *
 * Railway free tier: 512MB container RAM.
 * V8 heap limit: --max-old-space-size=448 (set in Dockerfile/package.json).
 * GC triggers at 350MB RSS to leave headroom before the 448MB V8 limit.
 *
 * Alert levels (based on % of GC_THRESHOLD_MB):
 *   < 80%  → OK          (< 320 MB)
 *   80-95% → Surveillance (320–380 MB)
 *   95-100% → Warning    (380–400 MB)
 *   ≥ 100% → Critical    (≥ 400 MB)
 */

export const MEMORY_CONFIG = {
  /** Container RAM on Railway (free tier = 512MB) */
  RAILWAY_RAM_MB: 512,

  /** V8 heap limit set via --max-old-space-size */
  V8_HEAP_LIMIT_MB: 448,

  /** RSS threshold (in MB) at which GC is forced — ultra-aggressive: 300MB */
  GC_THRESHOLD_MB: 300,

  /** Check interval in ms — every 60 seconds */
  CHECK_INTERVAL_MS: 60 * 1000, // 1 min

  /** Alert level percentages of GC_THRESHOLD_MB */
  LEVELS: {
    OK: 0,
    SURVEILLANCE: 70,   // 210 MB
    WARNING: 85,        // 255 MB
    CRITICAL: 100,      // 300 MB
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
