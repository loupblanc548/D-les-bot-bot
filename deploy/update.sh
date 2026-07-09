#!/bin/bash
set -euo pipefail

# ============================================================
#  Discord Bot — Mise à jour sur VPS OVH
#  Usage: bash update.sh
# ============================================================

BOT_DIR="/opt/discord-bot"

echo "=== Mise à jour Discord Bot ==="

cd "${BOT_DIR}"

echo "[1/4] Pull git..."
git pull origin main

echo "[2/4] Installation dépendances..."
npm install --production=false

echo "[3/4] Prisma..."
npx prisma generate
npx prisma migrate deploy

echo "[4/4] Redémarrage..."
systemctl restart discord-bot

echo "=== Bot redémarré ==="
echo "Logs: journalctl -u discord-bot -f"
