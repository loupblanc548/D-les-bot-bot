#!/usr/bin/env bash
# ============================================================
#  STOP.SH - Arrête le bot Discord (PM2)
#  À placer dans D:\les bot\bot
#  Usage : bash stop.sh   ou   ./stop.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "================================================================"
echo "              BOT DISCORD - ARRÊT"
echo "================================================================"
echo ""
echo "  [INFO] $(date '+%d/%m/%Y %H:%M:%S')"
echo ""

# Aller dans le dossier du bot (silencieux si absent)
cd "$SCRIPT_DIR" 2>/dev/null || true

# ---- PM2 ----
PM2_CMD=""
if command -v pm2 &>/dev/null; then
    PM2_CMD="pm2"
elif [ -f "node_modules/.bin/pm2" ]; then
    PM2_CMD="npx pm2"
fi

if [ -z "$PM2_CMD" ]; then
    echo "  [INFO] PM2 non installé. Vérification processus directs..."
    # Vérifier processus Node.js directs
    if tasklist /FI "IMAGENAME eq node.exe" /NH 2>/dev/null | grep -qi "node.exe"; then
        echo "  [INFO] Processus Node.js détectés."
        echo ""
        echo "  [ATTENTION] Arrêter TOUS les processus Node.js affectera"
        echo "              toutes les applications Node en cours !"
        echo ""
        tasklist /FI "IMAGENAME eq node.exe" /NH 2>/dev/null || true
        echo ""
        read -rp "  Confirmer l'arrêt ? (O/N) : " CONFIRM
        if [[ "${CONFIRM^^}" != "O" ]]; then
            echo "  [ANNULÉ] Arrêt annulé."
            exit 0
        fi
        taskkill /IM node.exe /T &>/dev/null || true
        sleep 2
        if tasklist /FI "IMAGENAME eq node.exe" /NH 2>/dev/null | grep -qi "node.exe"; then
            taskkill /F /IM node.exe /T &>/dev/null || true
        fi
        echo "  [OK] Processus Node.js arrêtés."
    else
        echo "  [INFO] Aucun processus Node.js détecté."
    fi
    echo ""
    echo "  ================================================================"
    echo "    $(date '+%d/%m/%Y %H:%M:%S') - Arrêt terminé"
    echo "  ================================================================"
    echo ""
    exit 0
fi

# ---- Bot dans PM2 ? ----
if $PM2_CMD jlist 2>/dev/null | grep -q '"name":"john-helldiver"'; then
    echo "  [OK] Bot détecté dans PM2. Arrêt en cours..."
    $PM2_CMD stop john-helldiver --silent 2>/dev/null || true

    # Attendre l'arrêt (max 10s)
    for i in {1..10}; do
        sleep 1
        if $PM2_CMD jlist 2>/dev/null | grep -q '"name":"john-helldiver","status":"stopped"'; then
            break
        fi
        if [ "$i" -eq 10 ]; then
            echo "  [WARN] Arrêt forcé..."
            $PM2_CMD delete john-helldiver --silent 2>/dev/null || true
        fi
    done

    $PM2_CMD save --force &>/dev/null
    echo "  [OK] Bot arrêté (PM2)."
else
    # Vérifier si d'autres processus PM2 tournent
    if $PM2_CMD jlist 2>/dev/null | grep -q '"pid":'; then
        echo "  [INFO] Bot absent de PM2. Processus PM2 actifs :"
        $PM2_CMD status --no-color 2>/dev/null || true
    fi

    # Fallback : processus Node.js directs
    if tasklist /FI "IMAGENAME eq node.exe" /NH 2>/dev/null | grep -qi "node.exe"; then
        echo "  [INFO] Processus Node.js directs détectés."
        echo ""
        echo "  [ATTENTION] Arrêter TOUS les processus Node.js affectera"
        echo "              toutes les applications Node en cours !"
        echo ""
        tasklist /FI "IMAGENAME eq node.exe" /NH 2>/dev/null || true
        echo ""
        read -rp "  Confirmer l'arrêt ? (O/N) : " CONFIRM
        if [[ "${CONFIRM^^}" != "O" ]]; then
            echo "  [ANNULÉ] Arrêt annulé."
        else
            taskkill /IM node.exe /T &>/dev/null || true
            sleep 2
            if tasklist /FI "IMAGENAME eq node.exe" /NH 2>/dev/null | grep -qi "node.exe"; then
                taskkill /F /IM node.exe /T &>/dev/null || true
            fi
            echo "  [OK] Processus Node.js arrêtés."
        fi
    else
        echo "  [INFO] Aucun processus Node.js détecté."
    fi
fi

echo ""
echo "  ================================================================"
echo "    $(date '+%d/%m/%Y %H:%M:%S') - Arrêt terminé"
echo "  ================================================================"
echo ""

# Pas de pause interactive si exécuté depuis un autre script
if [ -t 0 ]; then
    echo "Appuyez sur Entrée pour quitter..."
    read -r
fi
