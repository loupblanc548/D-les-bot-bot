#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'curl -s -o /dev/null -w "preview?game=SlimeSlider: HTTP %{http_code}\n" "http://localhost:3000/releases/preview?game=SlimeSlider"; curl -s "http://localhost:3000/releases/preview?game=SlimeSlider" 2>&1 | head -5'
