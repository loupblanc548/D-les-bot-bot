#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git pull origin main 2>&1 | tail -2
npm run build 2>&1 | tail -2
systemctl restart discord-bot
echo "Waiting for boot..."
sleep 180
echo "=== LOGS ==="
journalctl -u discord-bot --no-pager --since "4 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|preview|page.*charg|connect.*vocal|HTTP.*prêt|BOT DEMARRE|salon.*créé|Désactiv" | head -15
echo "=== ENDPOINTS ==="
curl -s -o /dev/null -w "/releases/preview?game=test: HTTP %{http_code}\n" "http://localhost:3000/releases/preview?game=test"
SSHEOF
