import os from "os";

/**
 * memoryConfig.ts — Seuls mémoire selon la machine.
 *
 *   tight  ≤5 GB   VPS minuscule
 *   vps8   <14 GB  VPS 8 Go (Contabo) — heap 1.5G, le reste pour OS/Postgres/Redis/swap
 *   local  ≥14 GB  mini PC / worker — heap 4G
 *
 * Un VPS 8 Go n'est PAS une machine "locale". L'ancien seuil ≤6 Go le classait
 * à tort en local (heap 4 Go) → OOM + swap mort.
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

const PROFILES: Record<
  MemoryProfile,
  Omit<MemoryConfigShape, "TOTAL_RAM_MB" | "PROFILE" | "IS_VPS">
> = {
  tight: {
    RAILWAY_RAM_MB: 1536,
    V8_HEAP_LIMIT_MB: 1024,
    GC_THRESHOLD_MB: 500,
    CRITICAL_THRESHOLD_MB: 800,
    CHECK_INTERVAL_MS: 20_000,
    WATCHDOG_GC_MB: 720,
    WATCHDOG_CRITICAL_MB: 870,
    WATCHDOG_SHUTDOWN_MB: 980,
    OFFLOAD_HEAP_MB: 700,
    SKIP_MEDIA_WORKER: true,
    SKIP_LLM_PREWARM: true,
    LEVELS: { OK: 0, SURVEILLANCE: 300, WARNING: 500, CRITICAL: 800 },
  },
  vps8: {
    RAILWAY_RAM_MB: 2048,
    V8_HEAP_LIMIT_MB: 1536,
    GC_THRESHOLD_MB: 900,
    CRITICAL_THRESHOLD_MB: 1400,
    CHECK_INTERVAL_MS: 30_000,
    WATCHDOG_GC_MB: 1100,
    WATCHDOG_CRITICAL_MB: 1300,
    WATCHDOG_SHUTDOWN_MB: 1480,
    OFFLOAD_HEAP_MB: 1100,
    SKIP_MEDIA_WORKER: true,
    SKIP_LLM_PREWARM: true,
    LEVELS: { OK: 0, SURVEILLANCE: 600, WARNING: 900, CRITICAL: 1400 },
  },
  local: {
    RAILWAY_RAM_MB: 8192,
    V8_HEAP_LIMIT_MB: 4096,
    GC_THRESHOLD_MB: 2500,
    CRITICAL_THRESHOLD_MB: 3600,
    CHECK_INTERVAL_MS: 45_000,
    WATCHDOG_GC_MB: 3200,
    WATCHDOG_CRITICAL_MB: 3800,
    WATCHDOG_SHUTDOWN_MB: 4000,
    OFFLOAD_HEAP_MB: 3500,
    SKIP_MEDIA_WORKER: false,
    SKIP_LLM_PREWARM: false,
    LEVELS: { OK: 0, SURVEILLANCE: 1500, WARNING: 2500, CRITICAL: 3600 },
  },
};

export function buildMemoryConfig(
  totalRAMMB: number,
  env: NodeJS.ProcessEnv = process.env,
): MemoryConfigShape {
  const profile = selectMemoryProfile(totalRAMMB, env);
  const base = PROFILES[profile];
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
