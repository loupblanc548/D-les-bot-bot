#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git stash
git pull origin main 2>&1 | tail -3
npm install 2>&1 | tail -3
npm run build 2>&1 | tail -3
ls -la dist/services/videoStream.js 2>&1
systemctl restart discord-bot
echo "Restart done, waiting..."
sleep 180
journalctl -u discord-bot --no-pager --since "4 min ago" 2>&1 | grep -iE "VideoStream|SCREEN_SHARE|VoiceScreen|BOT DEMARRE" | head -15
SSHEOF
