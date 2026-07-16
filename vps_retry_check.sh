#!/bin/bash
sleep 30
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "3 min ago" 2>&1 | grep -iE "VideoStream.*jeux|VideoStream.*prochain|VideoStream.*Go.Live|VideoStream.*fallback|VideoStream.*chargée|VideoStream.*retry" | head -20'
