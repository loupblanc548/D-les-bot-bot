# Reliability & Resilience Runbook

## Overview

This document describes the reliability patterns implemented in the bot:

- **HTTP Client Wrapper** (`src/utils/httpClient.ts`): timeout, retries, exponential backoff with jitter, circuit breaker
- **Concurrency Pool** (`src/utils/concurrencyPool.ts`): bulkhead pattern to limit parallel external calls
- **AI Gateway** (`src/utils/aiGateway.ts`): multi-provider fallback with per-provider circuit breakers
- **Local LLM** (`src/services/localLlm.ts`): integrated with httpClient + breaker + pool

## Configuration (Environment Variables)

### HTTP Client

| Variable                  | Default | Description         |
| ------------------------- | ------- | ------------------- |
| `HTTP_DEFAULT_TIMEOUT_MS` | 10000   | Per-request timeout |
| `HTTP_RETRIES`            | 3       | Retry attempts      |
| `HTTP_BACKOFF_BASE_MS`    | 300     | Base backoff delay  |
| `HTTP_BACKOFF_MAX_MS`     | 10000   | Max backoff delay   |

### Circuit Breaker

| Variable                 | Default | Description                       |
| ------------------------ | ------- | --------------------------------- |
| `CB_FAILURE_THRESHOLD`   | 5       | Failures before opening           |
| `CB_COOLDOWN_MS`         | 60000   | Open state duration               |
| `CB_ROLLING_WINDOW_MS`   | 60000   | Failure counting window           |
| `CB_HALF_OPEN_SUCCESSES` | 2       | Successes to close from half-open |

### Concurrency

| Variable                    | Default | Description                  |
| --------------------------- | ------- | ---------------------------- |
| `LLM_MAX_CONCURRENCY_LOCAL` | 4       | Max parallel local LLM calls |
| `AI_MAX_CONCURRENCY_GLOBAL` | 4       | Max parallel cloud AI calls  |

### LLM

| Variable            | Default                   | Description      |
| ------------------- | ------------------------- | ---------------- |
| `LOCAL_LLM_ENABLED` | true                      | Enable local LLM |
| `LOCAL_LLM_URL`     | http://127.0.0.1:11434/v1 | Ollama endpoint  |
| `LOCAL_LLM_MODEL`   | qwen2.5:14b               | Model name       |
| `AI_PROVIDER_ORDER` | local,openai,openrouter   | Fallback order   |

## How It Works

### Retry Logic

1. Request fails (network error, timeout, 5xx, 429)
2. Wait: `backoffBaseMs * 2^(attempt-1) / 2 + random_jitter`
3. Retry up to `retries` times
4. If all retries fail, return `fallback` or throw

### Circuit Breaker States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: All requests fail fast with `E_CIRCUIT_OPEN` error
- **HALF_OPEN**: After cooldown, allows limited requests to test recovery

### Concurrency Pool

- Limits parallel calls to prevent resource exhaustion
- Queues excess requests until a slot is available
- Reports `pending` and `running` counts for monitoring

## Per-API Tuning Recommendations

| API                | Timeout | Retries | Breaker Threshold | Cooldown |
| ------------------ | ------- | ------- | ----------------- | -------- |
| Local LLM (Ollama) | 30s     | 2       | 4                 | 60s      |
| OpenAI             | 60s     | 2       | 5                 | 60s      |
| OpenRouter         | 30s     | 3       | 5                 | 60s      |
| Discord API        | 10s     | 3       | 10                | 30s      |
| Scraping           | 60s     | 1       | 3                 | 120s     |

## Monitoring

### Metrics to track (Prometheus)

- `external_request_retries_total{api}` — retry count per API
- `external_request_failures_total{api}` — failure count per API
- `circuitbreaker_state{api,state}` — current breaker state
- `concurrency_pool_running{pool}` — active concurrent calls
- `concurrency_pool_pending{pool}` — queued calls

### Alerts

- Circuit breaker OPEN for >5 minutes
- Retry rate > 30% of requests
- Concurrency pool pending > 10 (saturation)
- External API p95 latency > 5s

## Testing

### Unit tests

```bash
npx vitest run tests/utils/httpClient.spec.ts
npx vitest run tests/utils/concurrencyPool.spec.ts
```

### Manual failure injection

```bash
# Stop local LLM and verify fallback
sudo systemctl stop ollama
# Check bot logs for circuit breaker opening and fallback to cloud API
# Restart and verify recovery
sudo systemctl start ollama
```

### Load test

```bash
npx autocannon -c 30 -d 20 http://localhost:3001/api/chat
```
