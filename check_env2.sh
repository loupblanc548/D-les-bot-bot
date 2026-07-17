#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'grep -E "SCREEN_SHARE|VOICE_CHANNEL|GUILD_ID" /opt/discord-bot/.env 2>/dev/null | sed "s/=.*/=.../"'
