# LLM Provider Policy

## Provider Order

Default: `openai → openrouter` while local Ollama is in **standby**
(Qwen weights stay on disk). After the Llama install: `local → openai → openrouter`.

### 1. Local (Ollama) — Standby until Llama

- **When to use**: Off by default (`LOCAL_LLM_ENABLED=false`, `OLLAMA_STANDBY=true`)
- **Unload RAM**: `bash scripts/ollama-standby.sh` (never `ollama rm`)
- **Model (later)**: Llama on the mini PC; Qwen 3B/7B/14B stay installed unused
- **Timeout**: 30s (chat), 90s (tools)
- **Concurrency**: Max 4 parallel requests
- **Circuit breaker**: Opens after 4 failures, 60s cooldown

### 2. OpenAI — Fallback 1

- **When to use**: Complex reasoning, long context, tool calling
- **Model**: `gpt-4o-mini` (cost-effective) or `gpt-4o` (quality)
- **Timeout**: 60s
- **Concurrency**: Max 4 parallel requests
- **Circuit breaker**: Opens after 5 failures, 60s cooldown

### 3. OpenRouter — Fallback 2

- **When to use**: Last resort, diverse model access
- **Model**: Configured via `OPENROUTER_MODEL`
- **Timeout**: 30s
- **Concurrency**: Max 4 parallel requests
- **Circuit breaker**: Opens after 5 failures, 60s cooldown

## Token Budget

- **Daily local LLM**: Unlimited (free, local)
- **Daily OpenAI**: Monitor via `ai_tokens_consumed_total` metric
- **Daily OpenRouter**: Monitor via dashboard
- **Alert**: If daily cloud token spend exceeds $5, alert ops

## PII Handling

- **Local LLM**: Safe — data never leaves the VPS
- **Cloud APIs**: Scrub PII before sending (email, phone, addresses)
- Use `src/scripts/pii-scan.ts` to audit stored data

## Failure Behavior

1. Local LLM timeout → fallback to OpenAI
2. OpenAI 429/500 → retry with backoff, then fallback to OpenRouter
3. All providers down → return error to user, log critical alert
4. Circuit breaker OPEN on any provider → skip to next in order

## Environment Variables

```env
LOCAL_LLM_ENABLED=false
OLLAMA_STANDBY=true
# Later (Llama):
# LOCAL_LLM_ENABLED=true
# OLLAMA_STANDBY=false
# LOCAL_LLM_MODEL=llama3.1:8b
LOCAL_LLM_URL=http://127.0.0.1:11434/v1
AI_PROVIDER_ORDER=openai,openrouter
LLM_MAX_CONCURRENCY_LOCAL=4
AI_MAX_CONCURRENCY_CLOUD=4
LLM_TIMEOUT_LOCAL_MS=30000
LLM_TIMEOUT_CLOUD_MS=60000
```
