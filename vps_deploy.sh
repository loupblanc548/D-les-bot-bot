#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
grep -q "GAME_RELEASE_VOICE_CHANNEL_ID" .env || echo -e "\n# === Game Release Countdown ===\nGAME_RELEASE_VOICE_CHANNEL_ID=1527279354583978054\nGAME_RELEASE_PLATFORM=all" >> .env
echo "ENV_DONE"
npm run build 2>&1 | tail -3
systemctl restart discord-bot
echo "RESTARTED"
sleep 3
systemctl status discord-bot --no-pager | head -10
SSHEOF
