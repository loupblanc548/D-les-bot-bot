#!/usr/bin/env bash
# pack-minipc.sh — Archive à copier sur le mini PC (décembre–janvier).
#
# Usage: bash scripts/pack-minipc.sh
# Produit: dist/minipc-bundle.tar.gz

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/dist"
STAMP="$(date +%Y%m%d)"
ARCHIVE="${OUT_DIR}/minipc-bundle-${STAMP}.tar.gz"

mkdir -p "${OUT_DIR}"
cd "${ROOT}"

tar -czf "${ARCHIVE}" \
  deploy \
  docs/LOCAL_LLM_SETUP.md \
  docs/DEPLOY-CONTABO.md \
  scripts/migrate_hardware.sh \
  scripts/setup-swap.sh \
  docker-compose.yml \
  docker-compose-vps.yml \
  ecosystem.config.cjs \
  .env.example \
  package.json

ln -sfn "$(basename "${ARCHIVE}")" "${OUT_DIR}/minipc-bundle.tar.gz"

echo "Archive: ${ARCHIVE}"
echo "Copie:   ${OUT_DIR}/minipc-bundle.tar.gz"
echo ""
echo "Sur le mini PC:"
echo "  1. Copier le .env du VPS (tokens) — ne pas le mettre dans le tar."
echo "  2. Lire docs/LOCAL_LLM_SETUP.md (Ollama qwen2.5:7b, Tailscale)."
echo "  3. docker compose -f deploy/docker-compose.yml up -d"
echo "     ou: npm ci && npx prisma migrate deploy && pm2 start ecosystem.config.cjs"
echo "  4. FORCE_LOCAL_MEMORY=1 si tu veux le profil 4 Go heap / media worker."
