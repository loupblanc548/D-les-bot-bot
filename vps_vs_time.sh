#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "17:14" --until "17:16" 2>&1 | grep -i "VoiceScreen" | head -10'
