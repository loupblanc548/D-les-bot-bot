#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager -n 2000 2>&1 | grep -i "VoiceScreen\|startVoice\|Erreur démarrage" | head -10'
