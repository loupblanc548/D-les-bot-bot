#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'sleep 10 && journalctl -u discord-bot --no-pager --since "1 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|screen|Démarrage.*screen|connect.*vocal|streaming|page.*charg|erreur.*screen"'
