#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'grep -n "getShowcasePage\|function getShowcase" /opt/discord-bot/dist/services/gameReleaseCountdownWeb.js'
