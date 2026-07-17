#!/bin/bash
# Tuer PM2 + redémarrer systemd
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
echo "=== PM2 list ==="
pm2 list 2>/dev/null

echo "=== Stop PM2 ==="
pm2 kill 2>/dev/null || true
pm2 delete all 2>/dev/null || true
sleep 3

echo "=== Disable PM2 startup ==="
pm2 unstartup 2>/dev/null || true

echo "=== Kill remaining tsx ==="
pkill -9 -f "tsx src/index" 2>/dev/null || true
sleep 3

echo "=== Restart systemd ==="
systemctl restart discord-bot
sleep 25

echo "=== Test ==="
curl -s http://localhost:3000/releases/showcase 2>/dev/null | wc -c
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "backdrop"
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "0.45"

echo "=== Processes ==="
ps aux | grep node | grep -v grep | head -3

echo "=== DONE ==="
SSHEOF
