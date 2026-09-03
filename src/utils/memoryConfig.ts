import os from "os";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const limitsPath = [
  join(here, "memoryLimits.cjs"),
  join(here, "..", "..", "src", "utils", "memoryLimits.cjs"),
].find((p) => existsSync(p));
if (!limitsPath) {
  throw new Error("memoryLimits.cjs introuvable (dist/utils ou src/utils)");
}
const { maxNodeHeapMb: heapFromLimits } = require(limitsPath) as {
  maxNodeHeapMb: (totalRAMMB: number, env?: NodeJS.ProcessEnv) => number;
};

/**
 * memoryConfig.ts — Seuls mémoire selon la machine.
 *
 *   tight  ≤5 GB   VPS minuscule — heap 1 Go
 *   vps8   <14 GB  VPS 8–12 Go — heap au max (RAM − 1.75 Go pour OS/Postgres/Redis)
 *   local  ≥14 GB  mini PC / worker — heap au max (RAM − 4 Go)
 *
 * NODE_MAX_OLD_SPACE_MB force le heap si besoin.
 */

export type MemoryProfile = "tight" | "vps8" | "local";

export interface MemoryConfigShape {
  TOTAL_RAM_MB: number;
  PROFILE: MemoryProfile;
  IS_VPS: boolean;
  RAILWAY_RAM_MB: number;
  V8_HEAP_LIMIT_MB: number;
  GC_THRESHOLD_MB: number;
  CRITICAL_THRESHOLD_MB: number;
  CHECK_INTERVAL_MS: number;
  WATCHDOG_GC_MB: number;
  WATCHDOG_CRITICAL_MB: number;
  WATCHDOG_SHUTDOWN_MB: number;
  OFFLOAD_HEAP_MB: number;
  SKIP_MEDIA_WORKER: boolean;
  SKIP_LLM_PREWARM: boolean;
  LEVELS: {
    OK: number;
    SURVEILLANCE: number;
    WARNING: number;
    CRITICAL: number;
  };
}

function envFlag(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = (env[key] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Heap Node max pour cette RAM — même formule que PM2 (`memoryLimits.cjs`). */
export function maxNodeHeapMb(totalRAMMB: number, env: NodeJS.ProcessEnv = process.env): number {
  return heapFromLimits(totalRAMMB, env);
}

export function selectMemoryProfile(
  totalRAMMB: number,
  env: NodeJS.ProcessEnv = process.env,
): MemoryProfile {
  if (envFlag(env, "WORKER_MODE") || envFlag(env, "FORCE_LOCAL_MEMORY")) return "local";
  if (envFlag(env, "FORCE_VPS_MEMORY")) return totalRAMMB <= 5120 ? "tight" : "vps8";
  if (totalRAMMB <= 5120) return "tight";
  if (totalRAMMB < 14336) return "vps8";
  return "local";
}

function scaledFromHeap(
  heap: number,
  extras: { CHECK_INTERVAL_MS: number; SKIP_MEDIA_WORKER: boolean; SKIP_LLM_PREWARM: boolean },
): Omit<MemoryConfigShape, "TOTAL_RAM_MB" | "PROFILE" | "IS_VPS"> {
  return {
    RAILWAY_RAM_MB: Math.round(heap * 1.18),
    V8_HEAP_LIMIT_MB: heap,
    GC_THRESHOLD_MB: Math.round(heap * 0.72),
    CRITICAL_THRESHOLD_MB: Math.round(heap * 0.9),
    CHECK_INTERVAL_MS: extras.CHECK_INTERVAL_MS,
    WATCHDOG_GC_MB: Math.round(heap * 0.78),
    WATCHDOG_CRITICAL_MB: Math.round(heap * 0.88),
    WATCHDOG_SHUTDOWN_MB: Math.round(heap * 0.95),
    OFFLOAD_HEAP_MB: Math.round(heap * 0.8),
    SKIP_MEDIA_WORKER: extras.SKIP_MEDIA_WORKER,
    SKIP_LLM_PREWARM: extras.SKIP_LLM_PREWARM,
    LEVELS: {
      OK: 0,
      SURVEILLANCE: Math.round(heap * 0.4),
      WARNING: Math.round(heap * 0.72),
      CRITICAL: Math.round(heap * 0.9),
    },
  };
}

const TIGHT_PROFILE = scaledFromHeap(1024, {
  CHECK_INTERVAL_MS: 20_000,
  SKIP_MEDIA_WORKER: true,
  SKIP_LLM_PREWARM: true,
});

export function buildMemoryConfig(
  totalRAMMB: number,
  env: NodeJS.ProcessEnv = process.env,
): MemoryConfigShape {
  const profile = selectMemoryProfile(totalRAMMB, env);
  const heap = maxNodeHeapMb(totalRAMMB, env);
  const base =
    profile === "tight"
      ? TIGHT_PROFILE
      : scaledFromHeap(heap, {
          CHECK_INTERVAL_MS: profile === "local" ? 45_000 : 30_000,
          SKIP_MEDIA_WORKER: profile !== "local",
          SKIP_LLM_PREWARM: profile !== "local",
        });
  const skipMedia = envFlag(env, "ENABLE_MEDIA_WORKER")
    ? false
    : envFlag(env, "DISABLE_MEDIA_WORKER")
      ? true
      : base.SKIP_MEDIA_WORKER;
  const skipPrewarm = envFlag(env, "ENABLE_LLM_PREWARM") ? false : base.SKIP_LLM_PREWARM;

  return {
    TOTAL_RAM_MB: totalRAMMB,
    PROFILE: profile,
    IS_VPS: profile !== "local",
    ...base,
    SKIP_MEDIA_WORKER: skipMedia,
    SKIP_LLM_PREWARM: skipPrewarm,
  };
}

export const MEMORY_CONFIG: MemoryConfigShape = buildMemoryConfig(
  Math.floor(os.totalmem() / (1024 * 1024)),
);

export type MemoryLevel = "OK" | "SURVEILLANCE" | "WARNING" | "CRITICAL";

export function getMemoryLevel(rssMB: number): MemoryLevel {
  if (rssMB >= MEMORY_CONFIG.LEVELS.CRITICAL) return "CRITICAL";
  if (rssMB >= MEMORY_CONFIG.LEVELS.WARNING) return "WARNING";
  if (rssMB >= MEMORY_CONFIG.LEVELS.SURVEILLANCE) return "SURVEILLANCE";
  return "OK";
}

export function formatMemoryReport(
  rssMB: number,
  heapUsedMB: number,
  _heapTotalMB: number,
): string {
  const pct = ((rssMB / MEMORY_CONFIG.GC_THRESHOLD_MB) * 100).toFixed(1);
  const level = getMemoryLevel(rssMB);
  return [
    `Profil : ${MEMORY_CONFIG.PROFILE} (${MEMORY_CONFIG.TOTAL_RAM_MB} MB RAM)`,
    `RSS : ${Math.round(rssMB)} MB / ${MEMORY_CONFIG.RAILWAY_RAM_MB} MB`,
    `Heap : ${Math.round(heapUsedMB)} MB / ${MEMORY_CONFIG.V8_HEAP_LIMIT_MB} MB`,
    `Seuil GC : ${MEMORY_CONFIG.GC_THRESHOLD_MB} MB`,
    `Utilisation du seuil GC : ${pct} %`,
    `État : ${level}`,
  ].join("\n");
}
