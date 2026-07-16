#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'curl -s http://localhost:3000/releases/data | python3 -m json.tool 2>&1 | head -40'
