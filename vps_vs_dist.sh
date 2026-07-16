#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'grep -n "VideoStream" /opt/discord-bot/dist/services/videoStream.js | head -5; grep -n "startVideoStream" /opt/discord-bot/dist/startup.js | head -5'
