#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git pull origin main 2>&1 | tail -3
npm install 2>&1 | tail -3
npx playwright install chromium 2>&1 | tail -3
npx playwright install-deps chromium 2>&1 | tail -3
npx prisma generate 2>&1 | tail -2
npm run build 2>&1 | tail -3

# Add GUILD_ID if missing
grep -q "GUILD_ID=" /opt/discord-bot/.env || echo "GUILD_ID=1133720050331832340" >> /opt/discord-bot/.env

systemctl restart discord-bot
sleep 20
echo "=== STATUS ==="
systemctl status discord-bot --no-pager | head -8
echo "=== ENDPOINTS ==="
curl -s -o /dev/null -w "/releases: HTTP %{http_code}\n" http://localhost:3000/releases
curl -s -o /dev/null -w "/releases/stats: HTTP %{http_code}\n" http://localhost:3000/releases/stats
echo "=== LOGS ==="
journalctl -u discord-bot --no-pager -n 50 2>&1 | grep -iE "ScreenShare|Voice|screen|voice|error" | head -15
SSHEOF
