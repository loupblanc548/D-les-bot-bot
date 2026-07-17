#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'grep "DISCORD_TOKEN" /opt/discord-bot/.env | sed "s/=.*/=.../" && grep "SCREEN_SHARE" /opt/discord-bot/.env | sed "s/=.*/=.../" && journalctl -u discord-bot --no-pager --since "5 min ago" 2>&1 | grep -i "connecté.*John\|login\|Bot.*ready\|client.*ready" | tail -3'
