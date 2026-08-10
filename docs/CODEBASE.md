# Codebase Architecture Overview

## Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry — starts bot, control server, health server |
| `src/bot.ts` | Discord client setup, event registration, login |
| `src/startup.ts` | Service initialization, schedulers, crons |
| `src/control-server.ts` | HTTP + WebSocket control server for dashboard |
| `src/services/health-http.ts` | Standalone health endpoint server (port 3000) |

## Core Modules

### AI / LLM
- `src/services/agentLoop.ts` — Main AI agent loop (tool calling, model selection)
- `src/services/localLlm.ts` — Ollama local LLM client (health, prewarm, chat, tools)
- `src/services/aichat.ts` — Chat AI fallback logic
- `src/utils/aiGateway.ts` — Multi-provider AI gateway with circuit breaker + metrics
- `src/utils/circuitBreaker.ts` — Circuit breaker for external API calls
- `src/utils/otelTracing.ts` — OpenTelemetry tracing wrappers for LLM/HTTP

### Discord
- `src/events/messages.ts` — Message event handler (commands, AI chat, moderation)
- `src/commandRouter.ts` — Slash command routing
- `src/commands/` — Command implementations (fun, moderation, gaming, etc.)

### Services
- `src/services/feeds.ts` — RSS feed aggregation (Nitter, YouTube, etc.)
- `src/services/monitor.ts` — Social media monitoring
- `src/services/socialFollow.ts` — Social media follow tracking
- `src/services/fortnite-api.ts` — Fortnite stats and cosmetics
- `src/services/steam.ts` / `steamNewsService.ts` — Steam integration
- `src/services/twitch.ts` — Twitch stream monitoring
- `src/services/telegram-notifications.ts` — Telegram bot integration
- `src/services/recommendation-system.ts` — AI-powered recommendations
- `src/services/sentiment-analysis.ts` — Sentiment analysis
- `src/services/risk-engine.ts` — Risk scoring for moderation

### Infrastructure
- `src/infrastructure/observability.ts` — Sentry + OpenTelemetry initialization
- `src/infrastructure/workerRuntime.ts` — Worker process runtime
- `src/services/metrics.ts` — Prometheus metrics (prom-client)
- `src/services/healthcheck.ts` — Health check service
- `src/services/health-http.ts` — HTTP health server
- `src/services/rateLimiter.ts` — Rate limiting service

### Utilities
- `src/utils/logger.ts` — Winston/Pino structured logging
- `src/utils/globalFetchGuard.ts` — SSRF protection for fetch calls
- `src/utils/redis.ts` — Redis client
- `src/utils/translator.ts` — Translation service
- `src/utils/deduplicationCache.ts` — Content deduplication
- `src/utils/gaming-embeds.ts` — Discord embed builders for gaming

### Data
- `prisma/schema.prisma` — Database schema (PostgreSQL via Neon)
- `src/prisma.ts` — Prisma client singleton

### Cron / Schedulers
- `src/cron/twitterCron.ts` — Twitter/X feed polling
- `src/cron/` — Other cron jobs (cleanup, notifications)

### Configuration
- `src/config.ts` — Centralized config (env vars, defaults)
- `.env.example` — Environment variable documentation

### Scripts
- `scripts/check_local_llm.sh` — LLM health check
- `scripts/chaos-test.sh` — Chaos engineering tests
- `scripts/db-backup.sh` — Database backup with S3 upload
- `src/scripts/pii-scan.ts` — PII scanner + retention policy
- `src/scripts/license-check.ts` — License compliance checker
- `src/cli.ts` — Admin CLI tool

### CI/CD
- `.github/workflows/ci.yml` — Lint, types, build, test, audit
- `.github/workflows/codeql.yml` — CodeQL SAST analysis
- `.github/workflows/sbom-trivy.yml` — SBOM + Trivy container scan
- `.github/workflows/e2e.yml` — E2E integration tests
- `.github/workflows/canary-deploy.yml` — Canary deployment
- `.github/workflows/cosign.yml` — Container image signing
- `.github/workflows/db-backup.yml` — Nightly DB backup

### Infrastructure
- `infra/terraform/main.tf` — VPS provisioning (Hetzner)
- `infra/ansible/provision.yml` — Server setup (Node, Docker, Chromium)
- `infra/prometheus/alert-rules.yml` — Alert rules
- `infra/grafana/dashboard.json` — Grafana dashboard

### Documentation
- `docs/ops/runbook-deploy.md` — Deployment runbook
- `docs/ops/LLM-Run-Guide.md` — Local LLM setup guide
- `docs/ops/secrets-migration.md` — Secrets management plan

## Architecture Diagram (simplified)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Discord    │────▶│   bot.ts     │────▶│  startup.ts │
│   Gateway    │◀────│  (events)    │     │ (services)  │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  messages.ts │
                    │ (handler)    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │agentLoop │ │ commands │ │moderation│
        │  (AI)    │ │ (router) │ │ (risk)   │
        └────┬─────┘ └──────────┘ └──────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
┌────────┐┌──────┐┌──────────┐
│Ollama  ││OpenAI││OpenRouter│
│(local) ││      ││(fallback)│
└────────┘└──────┘└──────────┘

┌─────────────┐     ┌─────────────┐
│control-server│     │ health-http  │
│  (port 3001) │     │  (port 3000) │
│  /metrics    │     │  /health     │
│  /ready      │     └─────────────┘
│  /live       │
│  /internal/  │
│   health     │
└─────────────┘
```

## Key Design Decisions

1. **Local LLM first** — Ollama (qwen2.5:7b-fast) as primary, external APIs as fallback
2. **Circuit breaker** — Prevents cascade failures when LLM/APIs are down
3. **SSRF guard** — All outbound fetch calls go through `globalFetchGuard.ts`
4. **Multi-stage Docker** — Build + production stages for smaller images
5. **Prometheus metrics** — Exposed at `/metrics` for scraping
6. **Non-destructive hardening** — All security improvements are additive
