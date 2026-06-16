#!/usr/bin/env bash
# ============================================================
#  START.SH - Démarre le bot Discord (PM2)
#  À placer dans D:\les bot\bot
#  Usage : bash start.sh   ou   ./start.sh (chmod +x)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "================================================================"
echo "              BOT DISCORD - DÉMARRAGE"
echo "================================================================"
echo ""
echo "  [INFO] $(date '+%d/%m/%Y %H:%M:%S')"
echo "  [INFO] Dossier : \"$SCRIPT_DIR\""
echo ""

# Aller dans le dossier du bot
if ! cd "$SCRIPT_DIR" 2>/dev/null; then
    echo "  [ERREUR] Dossier introuvable : \"$SCRIPT_DIR\""
    echo "  Vérifiez le chemin et réessayez."
    exit 1
fi

# ---- Node.js ----
if ! command -v node &>/dev/null; then
    echo "  [ERREUR] Node.js introuvable."
    exit 1
fi
echo "  [OK] Node.js : $(node --version)"

# ---- PM2 (local ou global) ----
PM2_CMD=""
if command -v pm2 &>/dev/null; then
    PM2_CMD="pm2"
elif [ -f "node_modules/.bin/pm2" ]; then
    PM2_CMD="npx pm2"
else
    echo "  [INFO] Installation de PM2 en local..."
    npm install pm2 --save-dev
    if [ $? -ne 0 ]; then
        echo "  [ERREUR] Impossible d'installer PM2."
        exit 1
    fi
    PM2_CMD="npx pm2"
fi

echo "  [OK] PM2     : $($PM2_CMD --version 2>/dev/null || echo '?')"

# ---- Nettoyage des processus fantomes ----
$PM2_CMD delete john-helldiver --silent 2>/dev/null || true

# ---- Vérifications ----
if [ ! -d "node_modules" ]; then
    echo "  [INFO] npm install..."
    npm install
    if [ $? -ne 0 ]; then
        echo "  [ERREUR] npm install échoué."
        exit 1
    fi
fi

if [ ! -f ".env" ]; then
    echo "  [ERREUR] .env introuvable."
    if [ -f ".env.example" ]; then
        echo "  Copiez .env.example en .env"
    fi
    exit 1
fi

# ---- Compilation TypeScript ----
if [ -f "tsconfig.json" ]; then
    echo "  [INFO] Compilation TypeScript..."
    npx tsc 2>&1 || echo "  [AVERTISSEMENT] Erreurs de compilation."
fi

# ---- Démarrage ----
echo ""
echo "  [INFO] Démarrage PM2..."

if [ -f "ecosystem.config.cjs" ]; then
    $PM2_CMD start ecosystem.config.cjs
else
    if [ ! -f "dist/index.js" ]; then
        echo "  [ERREUR] dist/index.js introuvable. Lancez d'abord : npx tsc"
        exit 1
    fi
    $PM2_CMD start dist/index.js --name john-helldiver --log bot.log --time
fi

if [ $? -ne 0 ]; then
    echo "  [ERREUR] Échec du démarrage."
    exit 1
fi

$PM2_CMD save --force &>/dev/null

# ---- Vérification ----
sleep 4
if $PM2_CMD jlist 2>/dev/null | grep -q '"status":"online"'; then
    echo "  [SUCCÈS] Bot démarré !"
    echo ""
    $PM2_CMD status john-helldiver --no-color 2>/dev/null
    echo ""
    echo "  Logs   : $PM2_CMD logs john-helldiver"
    echo "  Stop   : bash stop.sh"
    echo "  Restart: bash restart.sh"
else
    echo "  [AVERTISSEMENT] Vérifiez les logs : $PM2_CMD logs john-helldiver"
fi

echo ""
echo "  ================================================================"
echo "    $(date '+%d/%m/%Y %H:%M:%S') - Démarrage terminé"
echo "  ================================================================"
echo ""

if [ -t 0 ]; then
    echo "Appuyez sur Entrée pour quitter..."
    read -r
fi
