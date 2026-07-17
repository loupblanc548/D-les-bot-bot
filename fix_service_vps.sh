#!/bin/bash
# Corriger le service systemd avec ExecStartPre qui tue les anciens processus
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
set -e

echo "=== Stop ==="
systemctl stop discord-bot 2>/dev/null || true
sleep 2
pkill -9 -f node 2>/dev/null || true
sleep 5

echo "=== Check ports ==="
fuser 3000/tcp 3002/tcp 3005/tcp 3006/tcp 2>/dev/null && echo "STILL IN USE" || echo "PORTS FREE"

echo "=== Update service ==="
cat > /etc/systemd/system/discord-bot.service << 'SVC'
[Unit]
Description=Discord Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/discord-bot
ExecStartPre=/bin/bash -c 'fuser -k 3000/tcp 3002/tcp 3005/tcp 3006/tcp 2>/dev/null; sleep 2'
ExecStartPre=/bin/mkdir -p /tmp/logs
ExecStart=/usr/bin/node --expose-gc --max-old-space-size=4096 /opt/discord-bot/dist/index.js
Restart=always
RestartSec=15
Environment=NODE_ENV=production
Environment=SKIP_RETROSPECTIVE=true
MemoryMax=6G

[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload

echo "=== Start ==="
systemctl start discord-bot
sleep 30

echo "=== Logs ==="
journalctl -u discord-bot --no-pager --since "35 sec ago" 2>&1 | grep -iE "VideoStream|Frame|stream|Go Live|Désactivé|showcase|en ligne|EADDRINUSE|error" | tail -15

echo "=== Status ==="
systemctl status discord-bot --no-pager | head -5

echo "=== DONE ==="
SSHEOF
