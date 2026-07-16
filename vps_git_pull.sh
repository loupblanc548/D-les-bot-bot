#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'cd /opt/discord-bot && git log --oneline -3 && git pull origin main 2>&1 | tail -5 && ls src/services/videoStream.ts 2>&1'
