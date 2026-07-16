#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git stash 2>&1
git pull origin main 2>&1 | tail -3
npm run build 2>&1 | tail -2
systemctl restart discord-bot
sleep 180
journalctl -u discord-bot --no-pager --since "4 min ago" 2>&1 | grep -iE "VideoStream|jeux.*venir|prochain jeu|fallback|erreur.*fetch|Go.Live|BOT DEMARRE" | head -15
SSHEOF
