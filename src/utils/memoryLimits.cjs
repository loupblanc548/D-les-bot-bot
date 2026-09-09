/**
 * Heap Node partagé — PM2 (CJS) et memoryConfig.ts (ESM) doivent rester alignés.
 */
function envFlag(env, key) {
  const v = String((env && env[key]) || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function maxNodeHeapMb(totalRAMMB, env) {
  const e = env || process.env;
  const forced = parseInt(String(e.NODE_MAX_OLD_SPACE_MB || "").trim(), 10);
  if (Number.isFinite(forced) && forced > 256) return forced;
  if (envFlag(e, "WORKER_MODE") || envFlag(e, "FORCE_LOCAL_MEMORY")) {
    return Math.max(4096, totalRAMMB - 2048);
  }
  if (totalRAMMB <= 5120) return 1024;
  if (totalRAMMB < 14336) return Math.max(1536, totalRAMMB - 1792);
  return Math.max(4096, totalRAMMB - 4096);
}

function restartMbFor(heap, totalMb) {
  return Math.min(Math.round(heap * 1.2), Math.max(heap + 256, totalMb - 768));
}

module.exports = { maxNodeHeapMb, restartMbFor };
