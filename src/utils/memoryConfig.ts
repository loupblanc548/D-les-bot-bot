import os from "os";

/**
 * memoryConfig.ts — Single source of truth for all memory thresholds.
 *
 * Auto-detects available RAM and adjusts thresholds accordingly:
 * - VPS (≤4GB RAM): conservative limits, 1.5GB heap
 * - Local (≥8GB RAM): aggressive limits, 4GB heap
 */

const totalRAMMB = Math.floor(os.totalmem() / (1024 * 1024));
const isVPS = totalRAMMB <= 6144; // ≤6GB = VPS mode

export const MEMORY_CONFIG = {
  /** Total system RAM detected */
  TOTAL_RAM_MB: totalRAMMB,
  IS_VPS: isVPS,

  /** Effective RAM limit for the bot process */
  RAILWAY_RAM_MB: isVPS ? 3072 : 8192,

  /** V8 heap limit set via --max-old-space-size */
  V8_HEAP_LIMIT_MB: isVPS ? 1536 : 4096,

  /** RSS threshold (in MB) at which GC is forced */
  GC_THRESHOLD_MB: isVPS ? 1536 : 4096,

  /** CRITICAL threshold (in MB) — near-absolute limit */
  CRITICAL_THRESHOLD_MB: isVPS ? 2304 : 6144,

  /** Check interval in ms */
  CHECK_INTERVAL_MS: isVPS ? 30 * 1000 : 60 * 1000,

  /** Alert level thresholds in absolute MB */
  LEVELS: {
    OK: 0,
    SURVEILLANCE: isVPS ? 768 : 2048,
    WARNING: isVPS ? 1536 : 4096,
    CRITICAL: isVPS ? 2304 : 6144,
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
export function formatMemoryReport(
  rssMB: number,
  heapUsedMB: number,
  _heapTotalMB: number,
): string {
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
