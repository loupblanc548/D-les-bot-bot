#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'grep -n "showcase" /opt/discord-bot/dist/services/health-http.js | head -5'
