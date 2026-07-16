#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager -n 300 2>&1 | grep -iE "ScreenShare|VoiceScreen|screen.share|Désactivé|GUILD_ID|erreur.*démarrage" | head -10'
