#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "10 min ago" 2>&1 | grep -iE "2002|voice|joinVoice|rate|cooldown|session|connect.*vocal|error.*voice|error.*stream|error.*Go Live" | tail -15'
