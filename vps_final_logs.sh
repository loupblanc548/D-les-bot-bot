#!/bin/bash
sleep 30
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "3 min ago" 2>&1 | grep -iE "VideoStream|SCREEN_SHARE|VoiceScreen|BOT DEMARRE" | head -15'
