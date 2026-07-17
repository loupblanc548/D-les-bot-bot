#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'free -h && echo "---" && cat /etc/systemd/system/discord-bot.service | grep -E "Memory|Limit" && echo "---" && cat /opt/discord-bot/.env | grep -E "WATCHDOG|GC_THRESHOLD|MEMORY" | sed "s/=.*/=.../"'
