#!/usr/bin/env bash
set -euo pipefail
LLM_URL="${LOCAL_LLM_URL:-http://127.0.0.1:11434}"
TIMEOUT=5

echo "Vérification LLM : $LLM_URL"

if curl -sS --max-time $TIMEOUT "${LLM_URL}/v1/models" >/dev/null 2>&1; then
  echo "[OK] /v1/models reachable"
  curl -sS --max-time $TIMEOUT "${LLM_URL}/v1/models" | jq . || true
  exit 0
fi

if curl -sS --max-time $TIMEOUT "${LLM_URL}/health" >/dev/null 2>&1; then
  echo "[OK] /health reachable"
  curl -sS --max-time $TIMEOUT "${LLM_URL}/health" | jq . || true
  exit 0
fi

payload='{"model":"qwen2.5:7b-fast","messages":[{"role":"user","content":"Ping"}]}'
if curl -sS -X POST "${LLM_URL}/v1/chat/completions" -H "Content-Type: application/json" -d "$payload" --max-time $TIMEOUT >/dev/null 2>&1; then
  echo "[OK] /v1/chat/completions responded"
  curl -sS -X POST "${LLM_URL}/v1/chat/completions" -H "Content-Type: application/json" -d "$payload" --max-time $TIMEOUT | jq . || true
  exit 0
fi

echo "[FAIL] LLM not reachable at ${LLM_URL}"
exit 2
