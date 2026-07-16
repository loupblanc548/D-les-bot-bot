#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'systemctl is-active discord-bot; journalctl -u discord-bot --no-pager -n 3 2>&1'
