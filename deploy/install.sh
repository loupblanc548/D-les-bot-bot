#!/bin/bash
set -euo pipefail

# ============================================================
#  Discord Bot — Installation automatique VPS OVH
#  Compatible: Ubuntu 22.04 / 24.04 LTS
#  Usage: bash install.sh
# ============================================================

BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[ATTENTION]${NC} $1"; }
err()  { echo -e "${RED}[ERREUR]${NC} $1"; }

echo -e "${BOLD}=== Installation Discord Bot sur VPS OVH ===${NC}"
echo ""

# ── Vérifications préalables ──────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  err "Lance ce script en root: sudo bash install.sh"
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  err "OS non supporté — Ubuntu 22.04/24.04 requis"
  exit 1
fi

source /etc/os-release
log "OS détecté: $PRETTY_NAME"

# ── 1. Système: mise à jour + outils de base ──────────────────

echo ""
echo -e "${BOLD}1/8 — Mise à jour du système${NC}"
apt update -y && apt upgrade -y
apt install -y curl wget git build-essential ufw fail2ban htop jq unzip

log "Système à jour"

# ── 2. Pare-feu (UFW) ─────────────────────────────────────────

echo ""
echo -e "${BOLD}2/8 — Configuration pare-feu${NC}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw --force enable
log "Pare-feu actif (SSH uniquement)"

# ── 3. Node.js 22 LTS ─────────────────────────────────────────

echo ""
echo -e "${BOLD}3/8 — Installation Node.js 22 LTS${NC}"
if command -v node &>/dev/null && [[ "$(node -v)" == v22.* ]]; then
  log "Node.js 22 déjà installé: $(node -v)"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
  log "Node.js installé: $(node -v)"
fi

# ── 4. PostgreSQL 16 ──────────────────────────────────────────

echo ""
echo -e "${BOLD}4/8 — Installation PostgreSQL${NC}"
if command -v psql &>/dev/null; then
  log "PostgreSQL déjà installé: $(psql --version)"
else
  sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  apt update -y
  apt install -y postgresql-16
  log "PostgreSQL installé"
fi

# Créer la base de données et l'utilisateur
echo ""
echo -e "${BOLD}4b/8 — Création base de données${NC}"
DB_NAME="discord_bot"
DB_USER="discord_bot"
DB_PASS=$(openssl rand -hex 16)

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || {
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
  log "Base de données créée: ${DB_NAME}"
}
log "PostgreSQL prêt"

# ── 5. Redis ──────────────────────────────────────────────────

echo ""
echo -e "${BOLD}5/8 — Installation Redis${NC}"
if command -v redis-cli &>/dev/null; then
  log "Redis déjà installé"
else
  apt install -y redis-server
  sed -i 's/^# maxmemory .*/maxmemory 128mb/' /etc/redis/redis.conf
  sed -i 's/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
  systemctl enable redis-server
  systemctl restart redis-server
  log "Redis installé et configuré"
fi

# ── 6. Cloner le bot ──────────────────────────────────────────

echo ""
echo -e "${BOLD}6/8 — Récupération du bot${NC}"
BOT_DIR="/opt/discord-bot"

if [[ -d "${BOT_DIR}/.git" ]]; then
  cd "${BOT_DIR}"
  git pull origin main
  log "Bot mis à jour"
else
  git clone https://github.com/loupblanc548/D-les-bot-bot.git "${BOT_DIR}"
  cd "${BOT_DIR}"
  log "Bot cloné dans ${BOT_DIR}"
fi

# ── 7. Configuration .env ─────────────────────────────────────

echo ""
echo -e "${BOLD}7/8 — Configuration .env${NC}"

if [[ -f "${BOT_DIR}/.env" ]]; then
  warn ".env existe déjà — préservé"
else
  cat > "${BOT_DIR}/.env" << ENVEOF
# === Discord Bot .env — VPS OVH ===

# Discord
DISCORD_TOKEN=REMPLACER_PAR_TON_TOKEN
GUILD_ID=REMPLACER_PAR_GUILD_ID

# Database (PostgreSQL local)
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public

# Redis (local)
REDIS_URL=redis://localhost:6379

# OpenRouter (traductions/résumés — fallback si pas d'Ollama)
OPENROUTER_API_KEY=REMPLACER_PAR_TA_CLE_OPENROUTER

# Ollama (désactivé sur VPS — pas de GPU)
OLLAMA_BASE_URL=http://localhost:99999
OLLAMA_MODEL=llama3.2:3b

# Intervals VPS (plus conservateur que local)
MONITORING_INTERVAL_MS=300000
TWITCH_CHECK_INTERVAL_MS=120000
PATCH_NOTES_INTERVAL_MS=600000
IG_NEWS_INTERVAL_MS=1800000
IG_GIVEAWAY_INTERVAL_MS=7200000
STEAM_NEWS_INTERVAL_MS=300000
RSS_CACHE_TTL_MS=120000
FORTNITE_CACHE_TTL_MS=300000
MAX_RETRO_POSTS=50

# Price alerts / release calendar / presence / pins
PRICE_ALERT_INTERVAL_MS=1800000
RELEASE_CALENDAR_INTERVAL_MS=3600000
PRESENCE_TRACKER_INTERVAL_MS=3600000
PIN_ROTATION_INTERVAL_MS=3600000

# Channels Discord (à remplir)
STEAM_EPIC_CHANNEL_ID=
STEAM_CHANNEL_ID=
FREE_GAMES_CHANNEL_ID=
PLAYSTATION_CHANNEL_ID=
FORTNITE_CHANNEL_ID=
BOUTIQUE_CHANNEL_ID=
XBOX_CHANNEL_ID=
NINTENDO_CHANNEL_ID=
ROBLOX_CHANNEL_ID=
INSTANT_GAMING_CHANNEL_ID=
GAMING_BLOG_CHANNEL_ID=
ENVEOF
  log ".env créé — il faut éditer les tokens!"
  warn "Édite ${BOT_DIR}/.env avec tes tokens Discord, OpenRouter, etc."
fi

# ── 8. Installation dépendances + build + DB ───────────────────

echo ""
echo -e "${BOLD}8/8 — Installation dépendances et migration DB${NC}"
cd "${BOT_DIR}"
npm install --production=false
log "Dépendances installées"

npx prisma generate
log "Prisma client généré"

npx prisma migrate deploy
log "Migrations appliquées"

# ── Service systemd ────────────────────────────────────────────

echo ""
echo -e "${BOLD}Création service systemd${NC}"

# Détecter le heap selon la RAM
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if [[ ${TOTAL_RAM} -le 4096 ]]; then
  HEAP_SIZE=1536
else
  HEAP_SIZE=4096
fi

cat > /etc/systemd/system/discord-bot.service << SVCEOF
[Unit]
Description=Discord Bot
After=network.target postgresql.service redis-server.service
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=${BOT_DIR}
ExecStart=/usr/bin/node --expose-gc --max-old-space-size=${HEAP_SIZE} --import tsx src/index.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=discord-bot

# Sécurité
NoNewPrivileges=false
ProtectSystem=false

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable discord-bot
log "Service systemd créé (auto-start + restart au crash)"

# ── Résumé final ───────────────────────────────────────────────

echo ""
echo -e "${BOLD}=== Installation terminée ===${NC}"
echo ""
echo -e "${YELLOW}AVANT DE DÉMARRER LE BOT:${NC}"
echo -e "  1. Édite le .env:  ${BOLD}nano ${BOT_DIR}/.env${NC}"
echo -e "  2. Mets ton token Discord, guild ID, clés API, channel IDs"
echo -e "  3. Sauvegarde (Ctrl+X, Y, Enter)"
echo ""
echo -e "${BOLD}Commandes utiles:${NC}"
echo -e "  Démarrer:     ${GREEN}systemctl start discord-bot${NC}"
echo -e "  Arrêter:      ${GREEN}systemctl stop discord-bot${NC}"
echo -e "  Redémarrer:   ${GREEN}systemctl restart discord-bot${NC}"
echo -e "  Statut:       ${GREEN}systemctl status discord-bot${NC}"
echo -e "  Logs live:    ${GREEN}journalctl -u discord-bot -f${NC}"
echo ""
echo -e "${BOLD}DB info:${NC}"
echo -e "  Database: ${DB_NAME}"
echo -e "  User:     ${DB_USER}"
echo -e "  Password: ${DB_PASS}"
echo -e "  (Sauvegarde ce mot de passe!)"
echo ""
echo -e "Heap V8: ${HEAP_SIZE}MB (détecté automatiquement selon ${TOTAL_RAM}MB RAM)"
echo ""
