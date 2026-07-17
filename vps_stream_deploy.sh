#!/bin/bash
# Déploiement VPS avec stream + watchdog renforcé
# Usage: bash vps_stream_deploy.sh

set -e

VPS_HOST="root@31.220.79.90"
VPS_PASS="Si62u1j55exIO8"
BOT_DIR="/opt/discord-bot"

echo "=== 1. Push git ==="
git add -A
git commit -m "stream watchdog + showcase dynamique + 100 jeux trackés" 2>/dev/null || true
git push origin main 2>&1 | tail -3

echo "=== 2. Déploiement VPS ==="
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "$VPS_HOST" << 'SSHEOF'
cd /opt/discord-bot

echo "--- Git pull ---"
git pull origin main 2>&1 | tail -3

echo "--- Build ---"
npm run build 2>&1 | tail -3

echo "--- Vérification .env ---"
grep -q "BOT_ROLE" .env || echo -e "\nBOT_ROLE=primary" >> .env
grep -q "GAME_RELEASE_VOICE_CHANNEL_ID" .env || echo -e "\nGAME_RELEASE_VOICE_CHANNEL_ID=1527279354583978054" >> .env
grep -q "GAME_RELEASE_PLATFORM" .env || echo -e "GAME_RELEASE_PLATFORM=all" >> .env

echo "--- Suppression AntiLoop locks ---"
rm -f /opt/bot/.restart-lock /opt/bot/.quarantine-lock /opt/discord-bot/.restart-lock /opt/discord-bot/.quarantine-lock 2>/dev/null

echo "--- Kill ports conflictuels ---"
fuser -k 3000/tcp 2>/dev/null || true

echo "--- Restart service ---"
systemctl restart discord-bot
sleep 5

echo "--- Status ---"
systemctl status discord-bot --no-pager | head -8

echo "--- Logs stream (15s) ---"
sleep 15
journalctl -u discord-bot --no-pager --since "20 sec ago" 2>&1 | grep -iE "VideoStream|Frame|Watchdog|stream|showcase|error|crash" | tail -15

echo "=== VPS DÉPLOYÉ ==="
SSHEOF

echo "=== Terminé ==="
