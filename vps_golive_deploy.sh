#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git stash 2>&1
git pull origin main 2>&1 | tail -3
npm run build 2>&1 | tail -2
systemctl restart discord-bot
echo "Waiting for boot..."
sleep 180
echo "=== LOGS ==="
journalctl -u discord-bot --no-pager --since "4 min ago" 2>&1 | grep -iE "VideoStream|Go.Live|selfbot|VoiceScreen|Désactiv.*Go Live|Désactiv.*VideoStream|BOT DEMARRE|reconnect" | head -15
SSHEOF
