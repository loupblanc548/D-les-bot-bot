#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'grep -E "BOT_ROLE|SCREEN_SHARE|VIDEO_STREAM" /opt/discord-bot/.env 2>/dev/null || echo "NOT FOUND"'
