// .env is loaded by dotenv in src/config.ts (not duplicated here)
module.exports = {
  apps: [{
    name: 'john-helldiver',
    script: 'node',
    args: '--import tsx src/index.ts',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
    },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    min_uptime: '10s',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    merge_logs: true,
    time: true,
    watch: false,
    max_memory_restart: '512M',
    kill_timeout: 10000,
    listen_timeout: 30000,
  }]
};
