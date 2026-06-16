#!/usr/bin/env bash
# ============================================================
#  STATUS.SH - Affiche le statut complet du bot
#  À placer dans D:\les bot\bot
#  Usage : bash status.sh   ou   ./status.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "================================================================"
echo "              BOT DISCORD - STATUT"
echo "================================================================"
echo ""
echo "  [INFO] $(date '+%d/%m/%Y %H:%M:%S')"
echo ""

# Aller dans le dossier du bot
cd "$SCRIPT_DIR" 2>/dev/null || {
    echo "  [ERREUR] Dossier introuvable : \"$SCRIPT_DIR\""
    exit 1
}

# ================================================================
echo "  =============================="
echo "    STATUT PM2"
echo "  =============================="
echo ""

PM2_CMD=""
if command -v pm2 &>/dev/null; then
    PM2_CMD="pm2"
elif [ -f "node_modules/.bin/pm2" ]; then
    PM2_CMD="npx pm2"
fi

if [ -n "$PM2_CMD" ]; then
    if $PM2_CMD jlist 2>/dev/null | grep -q '"name":"john-helldiver"'; then
        echo "    [BOT] EN LIGNE"
        echo ""
        $PM2_CMD status john-helldiver --no-color 2>/dev/null || true
        echo ""
        echo "    Logs : $PM2_CMD logs john-helldiver"
    else
        echo "    [BOT] HORS LIGNE"
    fi
else
    echo "    PM2 non installé"
fi

# ================================================================
echo ""
echo "  =============================="
echo "    PROCESSUS NODE.JS"
echo "  =============================="
echo ""

if tasklist /FI "IMAGENAME eq node.exe" /NH 2>/dev/null | grep -qi "node.exe"; then
    echo "    Actifs :"
    tasklist /FI "IMAGENAME eq node.exe" /NH 2>/dev/null || true
else
    echo "    Aucun processus Node.js"
fi

# ================================================================
echo ""
echo "  =============================="
echo "    SYSTÈME"
echo "  =============================="
echo ""

if command -v node &>/dev/null; then
    echo "    Node.js    : $(node --version)"
else
    echo "    Node.js    : Non trouvé"
fi

if [ -n "$PM2_CMD" ]; then
    echo "    PM2        : $($PM2_CMD --version 2>/dev/null || echo '?')"
fi

# RAM libre (PowerShell)
if command -v powershell &>/dev/null; then
    FREE_MB=$(powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB)" 2>/dev/null || echo "?")
    echo "    RAM libre  : ${FREE_MB} Mo"
else
    echo "    RAM libre  : ?"
fi

# ================================================================
echo ""
echo "  =============================="
echo "    FICHIERS"
echo "  =============================="
echo ""

if [ -f ".env" ]; then
    echo "    .env       : Présent"
else
    echo "    .env       : INTROUVABLE"
fi

if [ -f "bot.log" ]; then
    LOG_SIZE=$(stat -c%s bot.log 2>/dev/null | awk '{printf "%.0f", $1/1024}' || echo "?")
    echo "    bot.log    : ${LOG_SIZE} Ko"
else
    echo "    bot.log    : Non trouvé"
fi

# ================================================================
echo ""
echo "  ================================================================"
echo "    Commandes : bash start.sh | bash stop.sh | bash restart.sh | bash status.sh"
echo "  ================================================================"
echo ""

if [ -t 0 ]; then
    echo "Appuyez sur Entrée pour quitter..."
    read -r
fi
