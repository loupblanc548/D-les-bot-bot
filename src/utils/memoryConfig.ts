/**
 * memoryConfig.ts — Single source of truth for all memory thresholds.
 *
 * Railway free tier: 512MB container RAM.
 * V8 heap limit: --max-old-space-size=448 (set in Dockerfile/package.json).
 * GC triggers at 450MB RSS — leaves ~62MB headroom before the 512MB hard limit.
 *
 * Alert levels (based on absolute RSS MB):
 *   < 350 MB  → OK           (normal operation)
 *   350–450   → SURVEILLANCE  (growing, keep an eye)
 *   450–490   → WARNING       (GC threshold reached, approaching limit)
 *   ≥ 490     → CRITICAL      (near 512MB hard limit — restart needed)
 */

export const MEMORY_CONFIG = {
  /** Container RAM on Railway (free tier = 512MB) */
  RAILWAY_RAM_MB: 512,

  /** V8 heap limit set via --max-old-space-size */
  V8_HEAP_LIMIT_MB: 448,

  /** RSS threshold (in MB) at which GC is forced */
  GC_THRESHOLD_MB: 450,

  /** CRITICAL threshold (in MB) — near-absolute limit */
  CRITICAL_THRESHOLD_MB: 490,

  /** Check interval in ms — every 60 seconds */
  CHECK_INTERVAL_MS: 60 * 1000, // 1 min

  /** Alert level thresholds in absolute MB */
  LEVELS: {
    OK: 0,
    SURVEILLANCE: 350,   // 350 MB
    WARNING: 450,        // 450 MB (= GC threshold)
    CRITICAL: 490,       // 490 MB (near 512 hard limit)
  },
} as const;

export type MemoryLevel = "OK" | "SURVEILLANCE" | "WARNING" | "CRITICAL";

/**
 * Computes memory usage level based on absolute RSS MB.
 */
export function getMemoryLevel(rssMB: number): MemoryLevel {
  if (rssMB >= MEMORY_CONFIG.LEVELS.CRITICAL) return "CRITICAL";
  if (rssMB >= MEMORY_CONFIG.LEVELS.WARNING) return "WARNING";
  if (rssMB >= MEMORY_CONFIG.LEVELS.SURVEILLANCE) return "SURVEILLANCE";
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
