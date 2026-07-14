/**
 * ecosystem.config.cjs — Configuration PM2 pour le bot Discord
 *
 * Lance le bot via tsx avec :
 *  - --import tsx : support TypeScript
 *  - --expose-gc : permet l'optimiseur mémoire de déclencher le GC
 */
module.exports = {
  apps: [
    {
      name: "john-helldiver",
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--expose-gc --max-old-space-size=448 --import tsx",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 3,
      min_uptime: "60s",
      restart_delay: 15000,
      exp_backoff_restart_delay: 200,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
      },
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
