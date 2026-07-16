#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'journalctl -u discord-bot --no-pager --since "5 min ago" 2>&1 | grep -iE "VideoStream|Go.Live|connect.*vocal|page.*charg|ffmpeg|playStream|erreur.*video|terminé|reconnect" | head -20'
