#!/bin/bash
# Installation Chromium + Puppeteer sur VPS + redémarrage
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'apt-get update -qq && apt-get install -y -qq chromium-browser 2>&1 | tail -5 && cd /opt/discord-bot && npm install puppeteer 2>&1 | tail -5 && systemctl restart discord-bot && sleep 10 && journalctl -u discord-bot --no-pager --since "15 sec ago" 2>&1 | grep -iE "VideoStream|Frame|stream|chromium|puppeteer|error" | tail -10'
