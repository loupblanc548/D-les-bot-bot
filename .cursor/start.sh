#!/usr/bin/env bash
# ============================================================================
#  Cloud Agent start script — Discord Surveillance Bot
#  Runs on every boot. Brings up the local Postgres and Redis services the
#  bot and its test suite depend on, then returns (idempotent).
#  The bot itself is started on demand with 'npm start' (needs a real
#  DISCORD_TOKEN); tests run with 'npm test'.
# ============================================================================
set -euo pipefail

echo "[start] Starting Redis..."
sudo service redis-server start || true

echo "[start] Starting PostgreSQL..."
sudo service postgresql start || true

# Brief readiness check (non-fatal).
for _ in $(seq 1 10); do
  if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "[start] PostgreSQL is ready."
    break
  fi
  sleep 1
done

redis-cli ping >/dev/null 2>&1 && echo "[start] Redis is ready." || echo "[start] Redis not responding yet."
echo "[start] Services started."
