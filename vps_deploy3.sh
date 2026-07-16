#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git pull origin main
npm install --production=false 2>&1 | tail -3
npx prisma generate 2>&1 | tail -2
npx prisma db push 2>&1 | tail -2
npm run build 2>&1 | tail -3
systemctl restart discord-bot
sleep 5
echo "=== STATUS ==="
systemctl status discord-bot --no-pager | head -8
echo "=== RELEASES ==="
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/releases
echo ""
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/releases/stats
echo ""
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/api/releases
echo ""
echo "=== LOGS ==="
journalctl -u discord-bot --no-pager -n 30 2>&1 | grep -iE "Release|Countdown|Steam|Translate|Spam|backup|error" | head -10
SSHEOF
