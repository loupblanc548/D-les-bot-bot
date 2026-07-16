#!/bin/bash
set -euo pipefail

# ============================================================
#  Discord Bot — Mise à jour sur VPS OVH
#  Usage: bash update.sh
# ============================================================

BOT_DIR="/opt/discord-bot"

echo "=== Mise à jour Discord Bot ==="

cd "${BOT_DIR}"

echo "[1/5] Pull git..."
git pull origin main

echo "[2/5] Vérification .env (ajout des variables manquantes)..."
ensure_env_var() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "${BOT_DIR}/.env" 2>/dev/null; then
    echo "${key}=${value}" >> "${BOT_DIR}/.env"
    echo "  → Ajouté: ${key}=${value}"
  fi
}
ensure_env_var "GAME_RELEASE_VOICE_CHANNEL_ID" "1527279354583978054"
ensure_env_var "GAME_RELEASE_PLATFORM" "all"

echo "[3/5] Installation dépendances..."
npm install --production=false

echo "[4/5] Prisma..."
npx prisma generate
npx prisma migrate deploy

echo "[5/5] Build + Redémarrage..."
npm run build
systemctl restart discord-bot

echo "=== Bot redémarré ==="
echo "Logs: journalctl -u discord-bot -f"
echo "Page releases: http://$(hostname -I | awk '{print $1}'):3000/releases"
