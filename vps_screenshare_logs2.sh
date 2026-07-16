#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'sleep 10 && journalctl -u discord-bot --no-pager -n 200 2>&1 | grep -iE "ScreenShare|screen|Voice|stream|ffmpeg|chromium|page.*charg|connect.*vocal"'
