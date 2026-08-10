## Summary

Non-destructive security & CI hardening + LLM health checks.

## Changes

- **A) .gitignore**: Exclude prisma engines, binary bundles, sensitive dumps, large JSON reports, password files, deepsec outputs, pnpm lockfile
- **B) package.json**: Remove `discord.js-selfbot-v13` (TOS/compliance), harden `postinstall` with `|| true` fallbacks, add `check:types` script
- **C) CI workflow**: Enhanced `.github/workflows/ci.yml` — added strict type check, build, test:ci with coverage, npm audit, coverage artifact upload, trigger on `chore/cleanup-security-ci`
- **D) Dependabot**: Already existed (more complete than requested) — no change needed
- **E) TypeScript strict**: Added `tsconfig.strict.json` with `strict`, `noImplicitAny`, `noUnusedLocals`, `forceConsistentCasingInFileNames`
- **F) Git hooks**: Enhanced `.lintstagedrc.json` (cover `*.{ts,js,tsx,jsx}` + `*.{json,md,css,scss}`), added `commitlint.config.cjs` with conventional commits config
- **G) Dockerfile.scraper**: New Dockerfile for Playwright/Chromium scraper environment
- **H) LLM healthcheck**: `scripts/check_local_llm.sh` — bash script to verify Ollama availability (`/v1/models`, `/health`, `/v1/chat/completions`)
- **I) Skeletons**: `src/infrastructure/observability.ts` (Sentry + OpenTelemetry init), `src/utils/aiGateway.ts` (multi-provider AI gateway with fallback)
- **J) Docs**: `docs/ops/runbook-deploy.md` (pre/post-deploy checklist, rollback, secret rotation), `docs/ops/LLM-Run-Guide.md` (Ollama install, model config, systemd, Docker, env vars, monitoring)
- **K) README**: Updated CI badge placeholder with actual repo URL

## Non-destructive

All changes are additive or config updates. No existing functionality removed (except `discord.js-selfbot-v13` dependency which is a TOS compliance fix).

## Tests to run locally

```bash
npm ci
npm run check:types
npm run lint
npm run format:check
npm run build
npm run test:ci

# LLM health check
export LOCAL_LLM_URL="http://127.0.0.1:11434"
chmod +x scripts/check_local_llm.sh
./scripts/check_local_llm.sh
```

## ⚠️ History Purge NOT Executed

**NO purge performed.** To start history rewrite (destructive, force push), send the command: `CONFIRMER_PURGE`

## Post-merge Checklist

- [ ] Rotate Discord token (Developer Portal → Reset Token → update `.env` → restart bot)
- [ ] Rotate DATABASE_URL (Neon console → reset password → update `.env` → restart)
- [ ] Rotate TELEGRAM_BOT_TOKEN (@BotFather → /revoke → update `.env` → restart)
- [ ] Rotate OPENROUTER_API_KEY (dashboard → new key → update `.env` → restart)
- [ ] Rotate GROQ_API_KEY (console → new key → update `.env` → restart)
- [ ] Restart services: `docker compose restart bot` on VPS
- [ ] Verify health: `curl http://localhost:3000/health`
- [ ] Verify LLM: `./scripts/check_local_llm.sh`
- [ ] Check Sentry & logs for error spikes
- [ ] Confirm CI badge shows green on README

## Reviewers

Ops & security team.
