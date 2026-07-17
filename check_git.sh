#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'cd /opt/discord-bot && git log --oneline -3 && echo "---" && grep "0.45" src/services/gameReleaseCountdownWeb.ts | head -1 && grep "0.85" src/services/gameReleaseCountdownWeb.ts | head -1'
