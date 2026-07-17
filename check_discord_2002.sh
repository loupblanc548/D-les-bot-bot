#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "10 min ago" 2>&1 | grep -iE "2002|rate.limit|WebSocket|close.*code|disconnect|reconnect|session" | tail -10'
