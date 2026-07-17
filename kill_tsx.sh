#!/bin/bash
# Tuer le processus tsx qui occupe le port 3000, garder seulement le build
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
echo "=== Kill tsx process ==="
kill -9 185915 2>/dev/null || true
sleep 3

echo "=== Check port 3000 ==="
lsof -i :3000 2>/dev/null | head -3

echo "=== Restart service ==="
systemctl restart discord-bot
sleep 25

echo "=== Test page ==="
curl -s http://localhost:3000/releases/showcase 2>/dev/null | wc -c
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "backdrop"
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "0.45"

echo "=== Processes ==="
ps aux | grep node | grep -v grep | head -3

echo "=== DONE ==="
SSHEOF
