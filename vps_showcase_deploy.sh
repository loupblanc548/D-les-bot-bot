#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git stash 2>&1
git pull origin main 2>&1 | tail -3
npm run build 2>&1 | tail -2

# Clear old DB cache so AAA/AA filter takes effect
mysql -u root -e "DELETE FROM GameReleaseCache;" discord_bot 2>/dev/null || true

systemctl restart discord-bot
sleep 240
journalctl -u discord-bot --no-pager --since "5 min ago" 2>&1 | grep -iE "VideoStream|jeux|showcase|Go.Live|BOT DEMARRE|hypes|AAA|indie" | head -15
SSHEOF
