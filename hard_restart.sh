#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'systemctl restart discord-bot && sleep 25 && curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "backdrop-filter" && curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "fetch.*data" && curl -s http://localhost:3000/releases/showcase 2>/dev/null | grep -c "0.55"'
