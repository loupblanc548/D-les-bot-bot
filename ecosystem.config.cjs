/**
 * ecosystem.config.cjs — PM2
 *
 * Heap et max_memory_restart suivent la RAM réelle :
 *   ≤5 Go  → 1024 Mo
 *   <14 Go → 1536 Mo  (VPS 8 Go)
 *   ≥14 Go → 4096 Mo  (mini PC)
 */
const os = require("os");

const totalMb = Math.floor(os.totalmem() / (1024 * 1024));
const forced = parseInt(process.env.NODE_MAX_OLD_SPACE_MB || "", 10);

function heapMb(ram) {
  if (Number.isFinite(forced) && forced > 256) return forced;
  if (process.env.WORKER_MODE === "1" || process.env.FORCE_LOCAL_MEMORY === "1") return 4096;
  if (ram <= 5120) return 1024;
  if (ram < 14336) return 1536;
  return 4096;
}

const heap = heapMb(totalMb);
const restartMb = Math.round(heap * 1.2);

module.exports = {
  apps: [
    {
      name: "bot",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: `${restartMb}M`,
      node_args: `--expose-gc --max-old-space-size=${heap}`,
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: `--max-old-space-size=${heap}`,
      },
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "30s",
      restart_delay: 5000,
      kill_timeout: 10000,
      wait_ready: false,
    },
  ],
};
