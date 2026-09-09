#!/usr/bin/env bash
# setup-swap.sh — Swap disque pour un VPS 8 Go (filet jusqu'au mini PC déc/jan)
#
# Usage: sudo bash scripts/setup-swap.sh
#
# Crée /swapfile (8 Go par défaut, plafonné à 25 % de l'espace libre),
# swappiness=25 (le disque aide sans voler toute la RAM chaude).

set -euo pipefail

SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE_G="${SWAP_SIZE_G:-8}"
SWAPPINESS="${SWAPPINESS:-25}"

if [[ ${EUID} -ne 0 ]]; then
  echo "Lance en root: sudo bash $0"
  exit 1
fi

free_g=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
max_g=$((free_g / 4))
if [[ ${max_g} -lt 2 ]]; then
  echo "Pas assez d'espace disque pour du swap (libre: ${free_g}G)."
  exit 1
fi
if [[ ${SWAP_SIZE_G} -gt ${max_g} ]]; then
  echo "Swap demandé ${SWAP_SIZE_G}G > 25% libre (${max_g}G) — on prend ${max_g}G."
  SWAP_SIZE_G=${max_g}
fi

existing_g=0
if [[ -f ${SWAP_FILE} ]]; then
  existing_g=$(du -BG "${SWAP_FILE}" | awk '{print $1}' | tr -dc '0-9')
fi

if swapon --show | grep -q "${SWAP_FILE}" && [[ ${existing_g} -ge 4 ]]; then
  echo "Swap déjà actif: ${SWAP_FILE} (${existing_g}G)."
else
  if swapon --show | grep -q "${SWAP_FILE}"; then
    swapoff "${SWAP_FILE}" || true
  fi
  rm -f "${SWAP_FILE}"
  echo "Création de ${SWAP_FILE} (${SWAP_SIZE_G}G)…"
  if command -v fallocate >/dev/null && fallocate -l "${SWAP_SIZE_G}G" "${SWAP_FILE}"; then
    :
  else
    dd if=/dev/zero of="${SWAP_FILE}" bs=1M count=$((SWAP_SIZE_G * 1024)) status=progress
  fi
  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}"
  swapon "${SWAP_FILE}"
  if ! grep -q "${SWAP_FILE}" /etc/fstab; then
    echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
  fi
  echo "Swap activé."
fi

sysctl -w "vm.swappiness=${SWAPPINESS}" >/dev/null
sysctl -w vm.vfs_cache_pressure=50 >/dev/null
if ! grep -q '^vm.swappiness' /etc/sysctl.d/99-bot-ram.conf 2>/dev/null; then
  cat > /etc/sysctl.d/99-bot-ram.conf <<EOF
vm.swappiness=${SWAPPINESS}
vm.vfs_cache_pressure=50
EOF
fi

echo ""
echo "=== RAM / swap ==="
free -h
echo ""
echo "swappiness=$(cat /proc/sys/vm/swappiness)  (25 = disque en débordement, pas en premier)"
echo "Heap Node recommandé: 1536 Mo sur un VPS 8 Go (ecosystem.config.cjs le calcule tout seul)."
echo "Mini PC (déc/jan): bash scripts/pack-minipc.sh"
