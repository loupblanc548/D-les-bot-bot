#!/bin/bash
# Rebuild complet + redémarrage
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
set -e
cd /opt/discord-bot

echo "=== Git pull ==="
git pull origin main 2>&1 | tail -3

echo "=== Clean build ==="
rm -rf dist
npm run build 2>&1 | tail -5

echo "=== Verify new code ==="
grep "backdrop-filter" dist/services/gameReleaseCountdownWeb.js | head -1
grep "MAX_TRACKED_GAMES" dist/services/gameReleaseCountdown.js | head -1
grep "limit 500" dist/services/gameReleaseCountdown.js | head -1

echo "=== Restart ==="
systemctl restart discord-bot
sleep 20

echo "=== Test page ==="
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "backdrop-filter"
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "fetch.*releases/data"
curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "0.55"

echo "=== Status ==="
systemctl status discord-bot --no-pager | head -3

echo "=== DONE ==="
SSHEOF
