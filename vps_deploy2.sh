#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git pull origin main
npm run build 2>&1 | tail -3
systemctl restart discord-bot
sleep 5
echo "=== STATUS ==="
systemctl status discord-bot --no-pager | head -8
echo "=== RELEASES ENDPOINT ==="
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/releases
echo ""
echo "=== RELEASES DATA ==="
curl -s http://localhost:3000/releases/data | head -200
echo ""
echo "=== LOGS ==="
journalctl -u discord-bot --no-pager -n 20 2>&1 | grep -iE "Release|Countdown|Game|error|endpoint"
SSHEOF
