#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'cd /opt/discord-bot && grep -n "DISCORD_GUILD_ID\|GUILD_ID" dist/services/voiceScreenShare.js | head -5 && systemctl restart discord-bot && sleep 25 && journalctl -u discord-bot --no-pager -n 100 2>&1 | grep -iE "VoiceScreen|ScreenShare|screen|Désactiv|connect.*vocal|streaming|page.*charg"'
