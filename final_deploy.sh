#!/bin/bash
# Déploiement final: pull, build, kill, restart, check
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
set -e
echo "=== Pull ==="
cd /opt/discord-bot && git pull origin main 2>&1 | tail -3

echo "=== Build ==="
npm run build 2>&1 | tail -3

echo "=== Stop + Kill ==="
systemctl stop discord-bot 2>/dev/null || true
sleep 2
pkill -9 -f node 2>/dev/null || true
sleep 5

echo "=== Start ==="
systemctl start discord-bot
sleep 30

echo "=== Stream logs ==="
journalctl -u discord-bot --no-pager --since "35 sec ago" 2>&1 | grep -iE "VideoStream|Frame|stream|Go Live|Désactivé|showcase|en ligne|EADDRINUSE|error" | tail -15

echo "=== Status ==="
systemctl status discord-bot --no-pager | head -5

echo "=== DONE ==="
SSHEOF
