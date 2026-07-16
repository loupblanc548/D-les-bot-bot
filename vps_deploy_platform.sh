#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 << 'SSHEOF'
cd /opt/discord-bot
git pull origin main 2>&1 | tail -3
npm run build 2>&1 | tail -2

# Add platform channel env vars if missing
grep -q "GAME_RELEASE_PC_CHANNEL" /opt/discord-bot/.env || echo "GAME_RELEASE_PC_CHANNEL=" >> /opt/discord-bot/.env
grep -q "GAME_RELEASE_PS_CHANNEL" /opt/discord-bot/.env || echo "GAME_RELEASE_PS_CHANNEL=" >> /opt/discord-bot/.env
grep -q "GAME_RELEASE_XBOX_CHANNEL" /opt/discord-bot/.env || echo "GAME_RELEASE_XBOX_CHANNEL=" >> /opt/discord-bot/.env
grep -q "GAME_RELEASE_NINTENDO_CHANNEL" /opt/discord-bot/.env || echo "GAME_RELEASE_NINTENDO_CHANNEL=" >> /opt/discord-bot/.env

systemctl restart discord-bot
sleep 25
echo "=== STATUS ==="
systemctl status discord-bot --no-pager | head -6
echo "=== ENDPOINTS ==="
curl -s -o /dev/null -w "/releases: HTTP %{http_code}\n" http://localhost:3000/releases
curl -s -o /dev/null -w "/releases?platform=pc: HTTP %{http_code}\n" "http://localhost:3000/releases?platform=pc"
curl -s -o /dev/null -w "/releases?platform=playstation: HTTP %{http_code}\n" "http://localhost:3000/releases?platform=playstation"
echo "=== LOGS ==="
journalctl -u discord-bot --no-pager --since "30 sec ago" 2>&1 | grep -iE "VoiceScreen|ScreenShare|screen|platform|notif|GameRelease|error" | head -15
SSHEOF
