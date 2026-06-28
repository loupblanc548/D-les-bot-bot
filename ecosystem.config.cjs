/**
 * ecosystem.config.cjs — Configuration PM2 pour le bot Discord
 *
 * Lance le bot via tsx avec :
 *  - --require ./src/undici-patch.cjs : patch undici AVANT discord.js (Node v26 fix)
 *  - --import tsx : support TypeScript
 *  - --expose-gc : permet l'optimiseur mémoire de déclencher le GC
 */
module.exports = {
  apps: [
    {
      name: "john-helldiver",
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--expose-gc --require ./src/undici-patch.cjs --import tsx",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "30s",
      restart_delay: 5000,
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
