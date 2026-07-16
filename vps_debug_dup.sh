#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "10 min ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|salon.*créé|création|error.*voice|error.*screen|ffmpeg|streaming|page.*charg|connect.*vocal" | head -30'
