#!/usr/bin/env bash
# ============================================================
#  RESTART.SH - Redémarre le bot Discord
#  À placer dans D:\les bot\bot
#  Usage : bash restart.sh   ou   ./restart.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "================================================================"
echo "              BOT DISCORD - REDÉMARRAGE"
echo "================================================================"
echo ""
echo "  [INFO] $(date '+%d/%m/%Y %H:%M:%S')"
echo ""
echo "  ================================================================"
echo "    PHASE 1/2 : ARRÊT"
echo "  ================================================================"
echo ""

# Arrêt
if [ -f "$SCRIPT_DIR/stop.sh" ]; then
    bash "$SCRIPT_DIR/stop.sh"
    STOP_RESULT=$?
elif [ -f "$SCRIPT_DIR/stop.sh" ]; then
    bash "$SCRIPT_DIR/stop.sh"
    STOP_RESULT=$?
else
    echo "  [ERREUR] stop.sh introuvable dans $SCRIPT_DIR"
    STOP_RESULT=1
fi

if [ "$STOP_RESULT" -ne 0 ]; then
    echo "  [ERREUR] L'arrêt a échoué. Redémarrage interrompu."
    exit 1
fi

# Pause
echo ""
echo "  [INFO] Pause 3s..."
sleep 3

# Démarrage
echo ""
echo "  ================================================================"
echo "    PHASE 2/2 : DÉMARRAGE"
echo "  ================================================================"
echo ""

if [ -f "$SCRIPT_DIR/start.sh" ]; then
    bash "$SCRIPT_DIR/start.sh"
    START_RESULT=$?
elif [ -f "$SCRIPT_DIR/start.sh" ]; then
    bash "$SCRIPT_DIR/start.sh"
    START_RESULT=$?
else
    echo "  [ERREUR] start.sh introuvable"
    START_RESULT=1
fi

echo ""
echo "  ================================================================"
echo "    $(date '+%d/%m/%Y %H:%M:%S') - Redémarrage terminé"
echo "  ================================================================"
if [ "$START_RESULT" -eq 0 ]; then
    echo "    [OK] Bot redémarré !"
else
    echo "    [ERREUR] Échec !"
fi
echo ""

if [ -t 0 ]; then
    echo "Appuyez sur Entrée pour quitter..."
    read -r
fi
exit "$START_RESULT"
