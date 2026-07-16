#!/bin/bash
sleep 60
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "5 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|screenshot|HTTP.*prêt|page.*charg|connect.*vocal|salon.*créé|salon.*réutilisé|BOT DEMARRE" | head -15'
