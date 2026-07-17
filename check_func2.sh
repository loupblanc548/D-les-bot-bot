#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'sed -n "572,580p" /opt/discord-bot/dist/services/gameReleaseCountdownWeb.js'
