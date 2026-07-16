#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'ls -la /opt/discord-bot/dist/services/video* 2>&1; npm run build --prefix /opt/discord-bot 2>&1 | tail -5; ls -la /opt/discord-bot/dist/services/video* 2>&1'
