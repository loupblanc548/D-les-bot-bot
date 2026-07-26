/**
 * ecosystem.config.js — Configuration PM2 pour le bot Discord
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart bot
 *   pm2 logs bot
 */
module.exports = {
  apps: [
    {
      name: "bot",
      script: "dist/index.js",
      cwd: "/opt/bot",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "4G",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
      error_file: "/root/.pm2/logs/bot-error.log",
      out_file: "/root/.pm2/logs/bot-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
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
