#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'ps aux | grep node | grep -v grep | head -3 && echo "---" && lsof -i :3000 2>/dev/null | head -5'
