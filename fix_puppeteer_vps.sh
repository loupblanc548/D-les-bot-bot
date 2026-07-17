#!/bin/bash
# Configurer puppeteer pour utiliser Chromium système + redémarrage
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && cd /opt/discord-bot && npm install puppeteer-core 2>&1 | tail -3 && which chromium-browser && echo "CHROMIUM OK" && systemctl restart discord-bot && sleep 15 && journalctl -u discord-bot --no-pager --since "20 sec ago" 2>&1 | grep -iE "VideoStream|Frame|stream|chromium|puppeteer|error|Go Live" | tail -10'
