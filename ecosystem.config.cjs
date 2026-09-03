/**
 * ecosystem.config.cjs — PM2
 *
 * Heap au max de la RAM réelle, avec une réserve OS :
 *   ≤5 Go  → 1024 Mo
 *   <14 Go → RAM − 1792 Mo  (VPS 8 Go → ~6.2 Go)
 *   ≥14 Go → RAM − 4096 Mo  (mini PC)
 *
 * max_memory_restart est plafonné à RAM − 768 Mo pour laisser l'OS respirer.
 */
const os = require("os");

const totalMb = Math.floor(os.totalmem() / (1024 * 1024));
const forced = parseInt(process.env.NODE_MAX_OLD_SPACE_MB || "", 10);

function heapMb(ram) {
  if (Number.isFinite(forced) && forced > 256) return forced;
  if (process.env.WORKER_MODE === "1" || process.env.FORCE_LOCAL_MEMORY === "1") {
    return Math.max(4096, ram - 2048);
  }
  if (ram <= 5120) return 1024;
  if (ram < 14336) return Math.max(1536, ram - 1792);
  return Math.max(4096, ram - 4096);
}

const heap = heapMb(totalMb);
const restartMb = Math.min(Math.round(heap * 1.2), Math.max(heap + 256, totalMb - 768));

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
