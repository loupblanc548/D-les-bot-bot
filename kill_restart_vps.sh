#!/bin/bash
# Tuer les processus sur les ports + redémarrer
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
echo "=== Kill old processes ==="
fuser -k 3002/tcp 3005/tcp 3006/tcp 3000/tcp 2>/dev/null || true
pkill -f "node.*discord-bot" 2>/dev/null || true
sleep 3

echo "=== Restart ==="
systemctl restart discord-bot
sleep 20

echo "=== Logs ==="
journalctl -u discord-bot --no-pager --since "25 sec ago" 2>&1 | grep -iE "VideoStream|Frame|stream|error|Go Live|Désactivé|showcase|EADDRINUSE" | tail -15

echo "=== Status ==="
systemctl status discord-bot --no-pager | head -5
SSHEOF
