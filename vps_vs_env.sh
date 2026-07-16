#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'grep SCREEN_SHARE /opt/discord-bot/.env; grep VIDEO_STREAM /opt/discord-bot/.env; echo "---"; journalctl -u discord-bot --no-pager -n 2000 2>&1 | grep -i "VideoStream" | head -5'
