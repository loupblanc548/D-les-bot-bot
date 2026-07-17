#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'systemctl list-units --type=service | grep -iE "bot|discord|stream" && echo "---" && crontab -l 2>/dev/null | grep -iE "bot|tsx|node" && echo "---" && ls /etc/systemd/system/*bot* 2>/dev/null'
