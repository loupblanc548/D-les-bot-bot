#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager -n 100 2>&1 | grep -iE "ScreenShare|screen.share|Voice.*connect|streaming|ffmpeg|playwright|chromium|voice.*ready"'
