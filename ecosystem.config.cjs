/**
 * ecosystem.config.cjs — PM2
 *
 * Heap via src/utils/memoryLimits.cjs (même formule que memoryConfig.ts).
 */
const os = require("os");
const { maxNodeHeapMb, restartMbFor } = require("./src/utils/memoryLimits.cjs");

const totalMb = Math.floor(os.totalmem() / (1024 * 1024));
const heap = maxNodeHeapMb(totalMb);
const restartMb = restartMbFor(heap, totalMb);

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
