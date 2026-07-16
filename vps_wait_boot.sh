#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'sleep 60 && journalctl -u discord-bot --no-pager --since "2 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|BOT DEMARRE|screen.*share|connect.*vocal|streaming|page.*charg" | head -15'
