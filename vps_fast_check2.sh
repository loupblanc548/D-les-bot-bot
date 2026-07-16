#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'sleep 30 && journalctl -u discord-bot --no-pager --since "3 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|screen|connect.*vocal|streaming|page.*charg|BOT DEMARRE" | head -15'
