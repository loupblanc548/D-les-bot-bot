#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/releases 2>&1; echo ""; curl -s http://localhost:3000/releases/data 2>&1 | head -200; echo ""; journalctl -u discord-bot --no-pager -n 300 2>&1 | grep -i "GameRelease\|Countdown\|IGDB\|releases\|Désactivé"'
