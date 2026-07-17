#!/bin/bash
# Installer Playwright + Chromium sur VPS
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'cd /opt/discord-bot && npm install playwright 2>&1 | tail -5 && npx playwright install chromium 2>&1 | tail -5 && npx playwright install-deps chromium 2>&1 | tail -5 && systemctl restart discord-bot && sleep 15 && journalctl -u discord-bot --no-pager --since "20 sec ago" 2>&1 | grep -iE "VideoStream|Frame|stream|playwright|chromium|error|Go Live|showcase" | tail -15'
