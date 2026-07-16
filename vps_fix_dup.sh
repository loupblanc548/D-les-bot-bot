#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git pull origin main 2>&1 | tail -2
npm run build 2>&1 | tail -2
systemctl restart discord-bot
echo "Bot redémarré, attente du boot..."
sleep 120
echo "=== LOGS ==="
journalctl -u discord-bot --no-pager --since "3 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|screenshot|HTTP.*prêt|page.*charg|connect.*vocal|salon.*créé|salon.*réutilisé|BOT DEMARRE" | head -15
SSHEOF
