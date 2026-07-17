#!/bin/bash
# Supprimer SCREEN_SHARE_USER_TOKEN du VPS + rebuild + restart
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
set -e

echo "=== 1. Remove user token ==="
sed -i '/^SCREEN_SHARE_USER_TOKEN=/d' /opt/discord-bot/.env
grep "SCREEN_SHARE" /opt/discord-bot/.env && echo "STILL THERE" || echo "TOKEN REMOVED"

echo "=== 2. Pull + Build ==="
cd /opt/discord-bot
git pull origin main 2>&1 | tail -2
rm -rf dist
npm run build 2>&1 | tail -3

echo "=== 3. Restart ==="
systemctl stop discord-bot
pkill -9 -f node 2>/dev/null || true
sleep 3
systemctl start discord-bot
sleep 25

echo "=== 4. Stream logs ==="
journalctl -u discord-bot --no-pager --since "30 sec ago" 2>&1 | grep -iE "VideoStream|Frame|Go Live|Client stream|error|Désactivé|salon vocal|connecté" | tail -10

echo "=== 5. Status ==="
systemctl status discord-bot --no-pager | head -3

echo "=== DONE ==="
SSHEOF
