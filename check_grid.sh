#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'grep -c "grid-template-columns\|games-grid\|2 col\|repeat(2" /opt/discord-bot/dist/services/gameReleaseCountdownWeb.js && grep "grid-template" /opt/discord-bot/dist/services/gameReleaseCountdownWeb.js | head -3'
