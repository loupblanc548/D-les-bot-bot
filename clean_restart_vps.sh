#!/bin/bash
# Tuer TOUS les processus node, attendre, puis redémarrer
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
echo "=== Stop service ==="
systemctl stop discord-bot
sleep 2

echo "=== Kill all node ==="
pkill -9 -f node 2>/dev/null || true
sleep 3

echo "=== Check ports ==="
fuser 3000/tcp 3002/tcp 3005/tcp 3006/tcp 2>/dev/null && echo "STILL IN USE" || echo "PORTS FREE"

echo "=== Start ==="
systemctl start discord-bot
sleep 25

echo "=== Logs ==="
journalctl -u discord-bot --no-pager --since "30 sec ago" 2>&1 | grep -iE "VideoStream|Frame|stream|error|EADDRINUSE|Go Live|Désactivé|showcase|en ligne" | tail -15

echo "=== Status ==="
systemctl status discord-bot --no-pager | head -5
SSHEOF
