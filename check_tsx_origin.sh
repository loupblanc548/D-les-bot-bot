#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'cat /proc/186950/cmdline 2>/dev/null | tr "\0" " " && echo "" && cat /proc/186950/environ 2>/dev/null | tr "\0" "\n" | grep -iE "PM2|tsx|WATCH|AUTO" | head -5'
