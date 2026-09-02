#!/usr/bin/env bash
# ollama-standby.sh — Unload Qwen/GLM/Llama from RAM. Does NOT delete models.
#
# Usage: bash scripts/ollama-standby.sh
#
# Keeps weights on disk (`ollama list`). Only `ollama stop` — never `ollama rm`.
# The bot stays on cloud APIs until LOCAL_LLM_ENABLED=true OLLAMA_STANDBY=false.

set -euo pipefail

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama n'est pas installé — rien à décharger."
  exit 0
fi

echo "=== Modèles sur disque (conservés) ==="
ollama list || true
echo ""

echo "=== Modèles actuellement en RAM ==="
ollama ps || true
echo ""

stopped=0

# Stop whatever is loaded (any name: qwen2.5:3b, qwen2.5:7b, glm, llama3.2, …)
while read -r name; do
  [[ -z "${name}" || "${name}" == "NAME" ]] && continue
  echo "→ ollama stop ${name}"
  if ollama stop "${name}"; then
    stopped=$((stopped + 1))
  else
    echo "  (stop échoué pour ${name} — déjà déchargé ?)"
  fi
done < <(ollama ps 2>/dev/null | awk 'NR>1 {print $1}')

# Known Qwen / GLM tags in case `ollama ps` is empty but keep_alive still holds them
KNOWN=(
  qwen2.5:1.5b
  qwen2.5:3b
  qwen2.5:7b
  qwen2.5:7b-fast
  qwen2.5:14b
  qwen2.5:32b
  qwen2.5vl:7b
  qwen:7b
  glm4:9b
  glm-4:9b
  llama3.2:3b
  llama3.2
)

for model in "${KNOWN[@]}"; do
  ollama stop "${model}" >/dev/null 2>&1 || true
done

echo ""
echo "=== RAM après standby (${stopped} modèle(s) stoppés via ps) ==="
ollama ps || true
echo ""
echo "Les fichiers restent sur disque. Pour Llama plus tard:"
echo "  LOCAL_LLM_ENABLED=true"
echo "  OLLAMA_STANDBY=false"
echo "  LOCAL_LLM_MODEL=llama3.1:8b"
