#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'cd /opt/discord-bot && git pull origin main 2>&1 | tail -2 && npm run build 2>&1 | tail -2 && systemctl restart discord-bot && sleep 25 && journalctl -u discord-bot --no-pager -n 200 2>&1 | grep -iE "ScreenShare|VoiceScreen|screen|Désactiv|connect.*vocal|streaming|ffmpeg|page.*charg|error.*voice"'
