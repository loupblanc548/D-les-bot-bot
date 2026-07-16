#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "3 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|HTTP.*prêt|BOT DEMARRE|screen|page.*charg|Attente" | head -15'
