#!/bin/bash
# Kill total, rebuild, restart
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
echo "=== Stop ==="
systemctl stop discord-bot
sleep 2
pkill -9 -f node 2>/dev/null || true
sleep 5

echo "=== Rebuild ==="
cd /opt/discord-bot
rm -rf dist
npm run build 2>&1 | tail -3

echo "=== Verify ==="
wc -c dist/services/gameReleaseCountdownWeb.js
grep -c "0.45" dist/services/gameReleaseCountdownWeb.js
grep -c "backdrop" dist/services/gameReleaseCountdownWeb.js

echo "=== Start ==="
systemctl start discord-bot
sleep 25

echo "=== Test ==="
curl -s http://localhost:3000/releases/showcase 2>/dev/null | wc -c
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "0.45"
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "backdrop"

echo "=== DONE ==="
SSHEOF
