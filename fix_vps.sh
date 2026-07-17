#!/bin/bash
# 1. Ajouter swap sur le VPS
# 2. Optimiser le service systemd (node flags)
# 3. Désactiver la rétrospective au démarrage
# 4. Redémarrer

sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
set -e

echo "=== 1. Swap ==="
if ! swapon --show | grep -q swap; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
  echo "Swap créé (4GB)"
else
  echo "Swap déjà actif"
fi
free -h

echo "=== 2. Service systemd ==="
cat > /etc/systemd/system/discord-bot.service << 'SVC'
[Unit]
Description=Discord Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/discord-bot
ExecStartPre=/bin/mkdir -p /tmp/logs
ExecStart=/usr/bin/node --expose-gc --max-old-space-size=4096 /opt/discord-bot/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=SKIP_RETROSPECTIVE=true
MemoryMax=6G

[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload
echo "Service mis à jour"

echo "=== 3. Redémarrage ==="
systemctl restart discord-bot
sleep 20

echo "=== 4. Logs ==="
journalctl -u discord-bot --no-pager --since "25 sec ago" 2>&1 | grep -iE "VideoStream|Frame|stream|error|Go Live|Désactivé|showcase|Memory" | tail -15

echo "=== DONE ==="
SSHEOF
