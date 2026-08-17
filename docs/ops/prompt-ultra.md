# PROMPT ULTRA — Hardening & Performance: full fix

> Collez ce prompt dans un assistant/LLM pour qu'il réalise automatiquement toutes les améliorations possibles.

---

Tu es un ingénieur DevOps/Sécurité senior et un développeur backend/infra. Objectif : améliorer entièrement le dépôt & l'infrastructure du projet (D-les-bot-bot) sur un VPS Ubuntu 24.04 pour atteindre ces objectifs :

## Objectifs

1. **Sécurité** : durcissement serveur, rotation secrets, détection & prévention d'incidents
2. **Fiabilité** : retries, timeouts, circuit-breakers, bulkheads, tests
3. **Performance** : caching, pré-calcul metrics, non-blocage, workerization, multi-core via PM2
4. **Observabilité** : Prometheus metrics, OpenTelemetry traces, Sentry errors, dashboards Grafana
5. **LLM ops** : config hybride (Ollama local + OpenAI fallback), token accounting, provider policy
6. **CI/CD** : workflows pour lint, types, tests, SAST (CodeQL), SCA (Dependabot/Trivy/SBOM), e2e tests
7. **DX** : devcontainer, docs, runbooks, PR templates, CODEOWNERS

## Contraintes

- N'exécute aucune opération destructive (purge historique, force-push, suppression d'utilisateurs) sans confirmation explicite `CONFIRMER_PURGE` ou `CONFIRMER_REMOVE`
- Fais des commits atomiques et fournis pour chaque changement : fichier complet, chemin, message de commit, commandes locales à exécuter, tests à lancer
- Priorise non-destructif ; propose plan pour opérations destructives en étapes

## Livrables attendus

### Fichiers à modifier/créer

| Fichier                            | Description                                                  |
| ---------------------------------- | ------------------------------------------------------------ |
| `src/utils/httpClient.ts`          | Wrapper fetch (timeout/retries/backoff/circuit-breaker)      |
| `src/utils/concurrencyPool.ts`     | Bulkhead/semaphore                                           |
| `src/utils/aiGateway.ts`           | Gateway hybride + breakers + token accounting                |
| `src/services/localLlm.ts`         | Intégration httpClient + pool                                |
| `src/services/metrics.ts`          | Counters Prometheus (retries, failures, breaker state, pool) |
| `src/workers/scraperWorker.ts`     | Skeleton worker BullMQ                                       |
| `.github/workflows/ci.yml`         | lint, types, build, test, codeql                             |
| `.github/workflows/trivy-sbom.yml` | SBOM + Trivy scan                                            |
| `.github/workflows/e2e.yml`        | docker-compose.test                                          |
| `.devcontainer/*`                  | Dev container config                                         |
| `Dockerfile`                       | Multi-stage, buildx                                          |
| `docs/ops/*`                       | Runbook, LLM policy, incident playbook, reliability          |
| `scripts/server_audit.sh`          | Audit serveur non-destructif                                 |
| `scripts/ip_investigate.sh`        | Investigation IP suspecte                                    |
| `infra/systemd/*`                  | Units Ollama + bot                                           |
| `infra/nginx/*`                    | Reverse proxy + rate limiting                                |

### Tests

- `tests/utils/httpClient.spec.ts` — mock fetch: success, retry on 500, retry on network error, circuit breaker open/close/half-open
- `tests/utils/concurrencyPool.spec.ts` — max concurrent, blocking, pending counts
- `tests/services/localLlm.spec.ts` — simulate LLM unavailability, verify fallback
- CI job qui lance vitest et upload coverage

### Observabilité

- Prometheus metrics endpoints (`/metrics`) avec counters: `external_request_retries_total`, `external_request_failures_total`, `circuitbreaker_state`, `concurrency_pool_running`
- OpenTelemetry Node SDK init + instrument AI calls et DB queries
- Sentry integration pour erreurs critiques

### Sécurité (ops)

- `scripts/server_audit.sh` — audit SSH, UFW, fail2ban, ports, crontab, disk, memory
- fail2ban tuning, UFW rules, ipset snippet
- Plan migration secrets vers Vault / GitHub Secrets
- Commandes rotation pour Discord token, DB credentials, Telegram bot token
- Checklist incident response si accès malveillant détecté

### LLM Policy

- Règles de routing: quand utiliser local vs cloud
- Timeouts, concurrency limits, token budget alerts
- Scrubbing PII avant envoi cloud
- Fallback automatique local → OpenAI → OpenRouter

### Testing & Validation

- Commandes benchmark (autocannon) pour latency & throughput
- Smoke tests pour vérifier fallback behavior
- Failure injection tests (kill local LLM, simulate 500)
- Comportement attendu documenté

## Instructions d'exécution

1. Fournir tous les contenus de fichiers dans la réponse (blocs de code)
2. Fournir une checklist finale de commandes à exécuter localement (git + npm + docker + systemctl)
3. Fournir un résumé des "quick wins" (top 5 actions immédiates sur VPS)
4. Estimer le temps de rollout complet

## Format de sortie

Pour chaque fichier :

````
### <chemin_fichier>
```langage
<contenu_complet>
````

**Commit**: `git add <path> && git commit -m "<message>"`
**Tests**: `<commandes>`

```

## Règles de sécurité

- NE divulgue AUCUN secret dans la sortie (tokens, passwords)
- Si un secret apparaît dans les logs, indique `EXPOSED_SECRET_FOUND` et demande rotation immédiate
- Avant tout changement destructif, demande `CONFIRM_REMOVE` ou `CONFIRM_ROTATE <secret-name>`

---

## Quick Wins (Top 5 immédiat sur VPS)

1. **Changer le mot de passe root** : `sudo passwd root`
2. **Rotater tous les tokens** : Discord, DB, Telegram, OpenRouter, Groq
3. **Installer unattended-upgrades** : `sudo apt install unattended-upgrades && sudo dpkg-reconfigure --priority=low unattended-upgrades`
4. **Activer AIDE (FIM)** : `sudo apt install aide && sudo aideinit`
5. **Configurer node_exporter** : Pour monitoring Prometheus

## Temps de rollout estimé

| Phase | Durée | Description |
|-------|-------|-------------|
| Quick wins VPS | 30 min | Password, tokens, updates, AIDE |
| Code reliability | 2h | httpClient, pool, localLlm integration |
| Tests | 1h | Unit tests, manual failure injection |
| Infra | 1h | systemd, nginx, deploy |
| Monitoring | 30 min | Prometheus, Grafana dashboard |
| Total | ~5h | Full rollout |
```
