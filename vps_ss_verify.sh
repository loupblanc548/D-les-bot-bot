#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "2 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|screen.share|Démarrage.*screen|connect.*vocal|streaming|page.*charg|ffmpeg.*screen|error.*screen|Désactiv.*screen|Désactiv.*voice"'
