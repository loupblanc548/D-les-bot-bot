#!/bin/bash
# Supprimer SCREEN_SHARE_USER_TOKEN du .env du VPS
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'bash -s' << 'SSHEOF'
echo "=== Before ==="
grep "SCREEN_SHARE_USER_TOKEN" /opt/discord-bot/.env | sed 's/=.*/=.../'

echo "=== Remove ==="
sed -i '/^SCREEN_SHARE_USER_TOKEN=/d' /opt/discord-bot/.env

echo "=== After ==="
grep "SCREEN_SHARE_USER_TOKEN" /opt/discord-bot/.env || echo "REMOVED"

echo "=== Restart ==="
systemctl restart discord-bot
sleep 20

echo "=== Stream logs ==="
journalctl -u discord-bot --no-pager --since "25 sec ago" 2>&1 | grep -iE "VideoStream|Frame|Go Live|Client stream|error|Désactivé" | tail -10

echo "=== DONE ==="
SSHEOF
