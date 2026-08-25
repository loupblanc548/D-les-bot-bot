#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# migrate_hardware.sh — Migration hardware pour le bot (janvier 2027)
#
# Ce script prépare le switch du modèle local 3B vers un modèle plus gros
# quand le nouveau hardware (GPU dédié) sera disponible.
#
# Usage:
#   ./migrate_hardware.sh --check     # Vérifier la config actuelle
#   ./migrate_hardware.sh --download  # Télécharger le nouveau modèle
#   ./migrate_hardware.sh --switch    # Switch vers le nouveau modèle
#   ./migrate_hardware.sh --rollback  # Revenir au 3B en cas de problème
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ──
CURRENT_MODEL="qwen2.5:3b"
# Options de modèles cibles selon VRAM disponible:
#   8GB VRAM  → qwen2.5:7b (Q4, ~4.5GB)
#   12GB VRAM → qwen2.5:14b (Q4, ~9GB) ou llama3.1:8b
#   16GB VRAM → qwen2.5:32b (Q4, ~20GB) — recommandé
#   24GB VRAM → qwen2.5:72b (Q4, ~42GB) — idéal pour tool-calling
TARGET_MODEL="${TARGET_MODEL:-qwen2.5:14b}"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
ENV_FILE="/opt/discord-bot/.env"
BACKUP_FILE="/opt/discord-bot/.env.pre-migration"

# ── Couleurs ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${CYAN}[STEP]${NC} $1"; }

# ── Fonctions ──

check_gpu() {
  log_step "Vérification du GPU..."
  if command -v nvidia-smi &>/dev/null; then
    nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv
    local vram_mb
    vram_mb=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1 | tr -d ' ')
    log_info "VRAM totale: ${vram_mb}MB"

    if [ "$vram_mb" -ge 24000 ]; then
      log_info "Recommandation: qwen2.5:72b (24GB+ VRAM)"
      echo "  export TARGET_MODEL=qwen2.5:72b"
    elif [ "$vram_mb" -ge 16000 ]; then
      log_info "Recommandation: qwen2.5:32b (16GB+ VRAM)"
      echo "  export TARGET_MODEL=qwen2.5:32b"
    elif [ "$vram_mb" -ge 12000 ]; then
      log_info "Recommandation: qwen2.5:14b (12GB+ VRAM)"
      echo "  export TARGET_MODEL=qwen2.5:14b"
    elif [ "$vram_mb" -ge 8000 ]; then
      log_info "Recommandation: qwen2.5:7b (8GB+ VRAM)"
      echo "  export TARGET_MODEL=qwen2.5:7b"
    else
      log_warn "VRAM insuffisante (< 8GB). Restez sur qwen2.5:3b"
    fi
  else
    log_warn "Pas de nvidia-smi détecté. GPU non disponible ou drivers manquants."
    log_info  "Si vous avez un GPU, installez les drivers NVIDIA d'abord:"
    echo "  sudo apt update && sudo apt install nvidia-driver-550"
    echo "  sudo reboot"
    echo "  # Après reboot: sudo curl -fsSL https://ollama.com/install.sh | sh"
  fi
}

check_ollama() {
  log_step "Vérification d'Ollama..."
  if curl -s "http://${OLLAMA_HOST}/api/tags" &>/dev/null; then
    log_info "Ollama accessible sur ${OLLAMA_HOST}"
    echo "  Modèles installés:"
    curl -s "http://${OLLAMA_HOST}/api/tags" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('models', []):
    size_gb = m.get('size', 0) / 1024 / 1024 / 1024
    print(f'    - {m[\"name\"]} ({size_gb:.1f} GB)')
" 2>/dev/null || echo "    (impossible de parser la liste)"
  else
    log_error "Ollama non accessible sur ${OLLAMA_HOST}"
    log_info  "Installer Ollama:"
    echo "  curl -fsSL https://ollama.com/install.sh | sh"
    echo "  systemctl enable --now ollama"
  fi
}

check_current_config() {
  log_step "Configuration actuelle..."
  if [ -f "$ENV_FILE" ]; then
    grep -E "LOCAL_LLM_MODEL|OLLAMA" "$ENV_FILE" 2>/dev/null || echo "  (pas de config LLM local dans .env)"
  else
    log_error "Fichier .env non trouvé: $ENV_FILE"
  fi
}

download_model() {
  log_step "Téléchargement du modèle ${TARGET_MODEL}..."
  log_info "Cela peut prendre plusieurs minutes selon la connexion..."
  ollama pull "$TARGET_MODEL"
  log_info "Modèle ${TARGET_MODEL} téléchargé avec succès"
}

switch_model() {
  log_step "Switch vers ${TARGET_MODEL}..."

  # Backup
  if [ -f "$ENV_FILE" ] && [ ! -f "$BACKUP_FILE" ]; then
    cp "$ENV_FILE" "$BACKUP_FILE"
    log_info "Backup créé: $BACKUP_FILE"
  fi

  # Modifier le .env
  if grep -q "LOCAL_LLM_MODEL=" "$ENV_FILE"; then
    sed -i "s|LOCAL_LLM_MODEL=.*|LOCAL_LLM_MODEL=\"${TARGET_MODEL}\"|" "$ENV_FILE"
  else
    echo "LOCAL_LLM_MODEL=\"${TARGET_MODEL}\"" >> "$ENV_FILE"
  fi

  log_info "LOCAL_LLM_MODEL mis à jour: ${TARGET_MODEL}"

  # Redémarrer le bot
  log_step "Redémarrage du bot..."
  pm2 restart bot --update-env
  log_info "Bot redémarré avec ${TARGET_MODEL}"

  # Test rapide
  log_step "Test du nouveau modèle..."
  sleep 5
  if curl -s "http://${OLLAMA_HOST}/api/generate" -d "{\"model\":\"${TARGET_MODEL}\",\"prompt\":\"Bonjour\",\"stream\":false}" | python3 -c "import sys,json; r=json.load(sys.stdin); print('  Réponse:', r.get('response','')[:100])" 2>/dev/null; then
    log_info "Test réussi!"
  else
    log_warn "Test échoué — vérifiez les logs: pm2 logs bot"
  fi
}

rollback() {
  log_step "Rollback vers ${CURRENT_MODEL}..."

  if [ -f "$BACKUP_FILE" ]; then
    cp "$BACKUP_FILE" "$ENV_FILE"
    log_info ".env restauré depuis backup"
  else
    sed -i "s|LOCAL_LLM_MODEL=.*|LOCAL_LLM_MODEL=\"${CURRENT_MODEL}\"|" "$ENV_FILE"
    log_info "LOCAL_LLM_MODEL remis à ${CURRENT_MODEL}"
  fi

  pm2 restart bot --update-env
  log_info "Bot redémarré avec ${CURRENT_MODEL}"
}

# ── Main ──
case "${1:-}" in
  --check)
    check_gpu
    check_ollama
    check_current_config
    ;;
  --download)
    check_gpu
    download_model
    ;;
  --switch)
    switch_model
    ;;
  --rollback)
    rollback
    ;;
  *)
    echo "Usage: $0 {--check|--download|--switch|--rollback}"
    echo ""
    echo "  --check     Vérifier GPU, Ollama et config actuelle"
    echo "  --download  Télécharger le modèle cible (TARGET_MODEL env)"
    echo "  --switch    Switch vers le nouveau modèle + restart bot"
    echo "  --rollback  Revenir au modèle 3B en cas de problème"
    echo ""
    echo "Variables d'environnement:"
    echo "  TARGET_MODEL  Modèle cible (défaut: qwen2.5:14b)"
    echo "  OLLAMA_HOST   Host Ollama (défaut: 127.0.0.1:11434)"
    exit 1
    ;;
esac
