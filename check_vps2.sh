#!/bin/bash
sleep 20
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "60 sec ago" 2>&1 | grep -iE "VideoStream|Frame|Watchdog|showcase|stream|error" | tail -15'
