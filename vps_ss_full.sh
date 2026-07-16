#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager -n 500 2>&1 | grep -i "VoiceScreenShare\|ScreenShare\|screen.share\|Désactiv.*screen\|Désactiv.*voice\|Erreur démarrage"'
