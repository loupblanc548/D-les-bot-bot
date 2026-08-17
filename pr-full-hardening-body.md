## Summary

Full non-destructive hardening: CI/CD, SAST, SCA, observability, LLM readiness, DX, governance, docs.

This PR builds on `chore/cleanup-security-ci` and adds the remaining items from the comprehensive hardening plan.

## Changed Files

### New Files

- `src/utils/otelTracing.ts` — OpenTelemetry tracing wrappers (LLM + HTTP)
- `src/utils/aiGateway.ts` — Enhanced with prom-client token counters, latency histogram, circuit breaker
- `src/control-server.ts` — Added `/ready`, `/live`, `/internal/health` endpoints
- `docs/CODEBASE.md` — Architecture overview with entrypoints, modules, diagram
- `.github/workflows/release.yml` — Changesets release workflow
- `.github/workflows/license-check.yml` — License compliance CI job

### From previous branch (chore/cleanup-security-ci)

- `.gitignore` — Security exclusions (prisma engines, bundles, dumps, passwords, lockfiles)
- `package.json` — Removed `discord.js-selfbot-v13`, hardened `postinstall`, added `check:types`
- `.github/workflows/ci.yml` — Enhanced CI (strict types, build, audit, coverage)
- `.github/workflows/codeql.yml` — CodeQL SAST with `javascript-typescript` + `security-and-quality`
- `.github/workflows/sbom-trivy.yml` — SBOM (CycloneDX) + Trivy container scan
- `.github/workflows/e2e.yml` — E2E integration tests with docker-compose
- `.github/workflows/canary-deploy.yml` — Canary deployment workflow
- `.github/workflows/cosign.yml` — Container image signing (cosign + GitHub OIDC)
- `.github/workflows/db-backup.yml` — Nightly DB backup (pg_dump + S3 + GPG)
- `.github/workflows/license-check.yml` — License compliance checker
- `.github/dependabot.yml` — Dependabot (weekly npm + GitHub Actions)
- `renovate.json` — Renovate config (auto-merge patch/minor, group majors)
- `.github/CODEOWNERS` — Code ownership rules
- `.github/pull_request_template.md` — PR template with security checklist
- `.github/ISSUE_TEMPLATE/` — Bug, feature, security issue templates
- `tsconfig.strict.json` — Strict TypeScript config
- `commitlint.config.cjs` — Conventional commits config
- `.lintstagedrc.json` — Enhanced lint-staged config
- `.husky/pre-commit-secret-scan` — Secret scanning pre-commit hook
- `.secret-scan.json` — Secret patterns (Discord, Neon, Telegram, Groq, OpenRouter)
- `Dockerfile.scraper` — Multi-stage Playwright/Chromium Dockerfile
- `scripts/check_local_llm.sh` — LLM health check script
- `scripts/chaos-test.sh` — Chaos engineering tests (kill-ollama, disconnect-db, etc.)
- `scripts/db-backup.sh` — DB backup script with S3 + GPG encryption
- `src/infrastructure/observability.ts` — Sentry + OpenTelemetry init
- `src/utils/aiGateway.ts` — AI gateway with circuit breaker + metrics
- `src/cli.ts` — Admin CLI (db:push, check-llm, health, rotate-secret)
- `src/scripts/pii-scan.ts` — PII scanner + 90-day retention policy
- `src/scripts/license-check.ts` — License compliance checker
- `.devcontainer/devcontainer.json` — VSCode devcontainer (Node 20, Postgres, Redis)
- `infra/terraform/main.tf` — Hetzner VPS provisioning
- `infra/ansible/provision.yml` — Server setup (Node, Docker, Chromium, UFW, swap)
- `infra/prometheus/alert-rules.yml` — Prometheus alert rules
- `infra/grafana/dashboard.json` — Grafana dashboard JSON
- `docs/ops/runbook-deploy.md` — Deployment runbook
- `docs/ops/LLM-Run-Guide.md` — LLM setup guide
- `docs/ops/secrets-migration.md` — Secrets management migration plan
- `README.md` — Updated CI badge

## Local Validation

```bash
npm ci
npm run check:types
npm run format:check
npm run lint
npm run build
npm run test:ci

# LLM health check
export LOCAL_LLM_URL="http://127.0.0.1:11434"
chmod +x scripts/check_local_llm.sh
./scripts/check_local_llm.sh

# Image scan
docker build -t bot-scraper:ci -f Dockerfile.scraper .
trivy image --exit-code 1 --severity CRITICAL,HIGH bot-scraper:ci
```

## Post-merge Checklist

- [ ] Rotate Discord token (Developer Portal → Reset Token → update `.env` → restart bot)
- [ ] Rotate DATABASE_URL (Neon console → reset password → update `.env` → restart)
- [ ] Rotate TELEGRAM_BOT_TOKEN (@BotFather → /revoke → update `.env` → restart)
- [ ] Rotate OPENROUTER_API_KEY (dashboard → new key → update `.env` → restart)
- [ ] Rotate GROQ_API_KEY (console → new key → update `.env` → restart)
- [ ] Restart services: `docker compose restart bot` on VPS
- [ ] Verify health: `curl http://localhost:3000/health`
- [ ] Verify readiness: `curl http://localhost:3001/ready`
- [ ] Verify liveness: `curl http://localhost:3001/live`
- [ ] Verify metrics: `curl http://localhost:3001/metrics`
- [ ] Verify LLM: `./scripts/check_local_llm.sh`
- [ ] Check Sentry & Prometheus for error spikes
- [ ] Confirm CI badge shows green on README
- [ ] Configure GitHub repo settings: branch protection (require PR review + status checks)
- [ ] Add GitHub Secrets: DISCORD_TOKEN, DATABASE_URL, TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, GROQ_API_KEY, BACKUP_S3_BUCKET, BACKUP_ENCRYPTION_KEY

## Git History Scan Results

- **Large files (>1MB)**: None found in git history. Largest file is `package-lock.json` (~212KB).
- **Secret scan**: No real secrets found in code. Only placeholder patterns in `.env.example` and documentation references.

## ⚠️ History Purge NOT Executed

**NO purge performed.** To execute history rewrite (destructive, force push), comment: `CONFIRMER_PURGE`

### Purge plan (prepared, not executed):

1. Mirror clone: `git clone --mirror <repo-url>`
2. Run `git filter-repo --invert-paths --paths <list>` or BFG commands
3. `git reflog expire --expire=now --all; git gc --prune=now --aggressive`
4. `git push --force`
5. Rotate ALL affected secrets immediately after purge
6. Communicate maintenance window to users

## Type of Change

- [x] Security improvement
- [x] CI/CD improvement
- [x] Documentation
- [x] New feature (health endpoints, CLI, observability)
- [x] DevEx improvement

## Security Checklist

- [x] No secrets/tokens committed
- [x] No new dependencies with copyleft licenses
- [x] Input validation added/updated if needed
- [x] No SSRF/XSS/SQLi introduced
