#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git pull origin main 2>&1 | tail -2
npm install 2>&1 | tail -3
npm run build 2>&1 | tail -2

# Add SCREEN_SHARE_USER_TOKEN to .env if missing
grep -q "SCREEN_SHARE_USER_TOKEN" /opt/discord-bot/.env || echo "SCREEN_SHARE_USER_TOKEN=" >> /opt/discord-bot/.env

systemctl restart discord-bot
echo "Waiting for boot..."
sleep 180
echo "=== LOGS ==="
journalctl -u discord-bot --no-pager --since "4 min ago" 2>&1 | grep -iE "VideoStream|Go Live|selfbot|SCREEN_SHARE|VideoStream.*Désactiv|VideoStream.*erreur|VoiceScreen|ScreenShare|BOT DEMARRE" | head -15
SSHEOF
