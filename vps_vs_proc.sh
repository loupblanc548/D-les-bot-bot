#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'systemctl is-active discord-bot; ps aux | grep node | grep -v grep | head -3; journalctl -u discord-bot --no-pager --since "17:13" 2>&1 | tail -5'
