#!/bin/bash
# Remettre le token utilisateur + rebuild + restart
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
set -e

echo "=== 1. Pull + Build ==="
cd /opt/discord-bot
git pull origin main 2>&1 | tail -3
rm -rf dist
npm run build 2>&1 | tail -3

echo "=== 2. Check token ==="
grep "SCREEN_SHARE_USER_TOKEN" /opt/discord-bot/.env | sed 's/=.*/=.../' || echo "MISSING — need to re-add"

echo "=== 3. Restart ==="
systemctl stop discord-bot
pkill -9 -f node 2>/dev/null || true
sleep 3
systemctl start discord-bot
sleep 30

echo "=== 4. Stream logs ==="
journalctl -u discord-bot --no-pager --since "35 sec ago" 2>&1 | grep -iE "VideoStream|Frame|Go Live|connecté|error|Désactivé|salon vocal" | tail -10

echo "=== 5. Status ==="
systemctl status discord-bot --no-pager | head -3

echo "=== DONE ==="
SSHEOF
