# Secrets Management Migration Plan

## Current State
- All secrets in `.env` files on VPS and local
- No centralized rotation or audit trail

## Target State
- Secrets stored in GitHub Organization Secrets (CI) + encrypted `.env` on VPS
- Rotation documented and semi-automated via `npm run cli -- rotate-secret`

## Migration Steps

### Phase 1: GitHub Secrets (CI)
1. Add all secrets to GitHub repo settings → Secrets and variables → Actions:
   - `DISCORD_TOKEN`
   - `DATABASE_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `OPENROUTER_API_KEY`
   - `GROQ_API_KEY`
   - `GEMINI_API_KEY`
   - `BACKUP_S3_BUCKET`
   - `BACKUP_ENCRYPTION_KEY`

2. Update CI workflows to use `${{ secrets.* }}` instead of hardcoded values

### Phase 2: VPS Secrets Hardening
1. Ensure `.env` file has `chmod 600` permissions
2. Add `.env` to `.gitignore` (already done)
3. Create `/opt/bot/.env` with restricted access:
   ```bash
   chmod 600 /opt/bot/.env
   chown root:root /opt/bot/.env
   ```

### Phase 3: Optional Vault Integration
If using HashiCorp Vault:
1. Install Vault agent on VPS
2. Configure secret backends (KV v2)
3. Update bot to fetch secrets at startup via Vault API
4. Set up auto-rotation policies

### Phase 4: Rotation Schedule
| Secret | Rotation Frequency | Method |
|--------|-------------------|--------|
| DISCORD_TOKEN | Every 90 days | Developer Portal → Reset |
| DATABASE_URL | Every 90 days | Neon Console → Reset password |
| TELEGRAM_BOT_TOKEN | Every 180 days | @BotFather → /revoke |
| OPENROUTER_API_KEY | Every 90 days | Dashboard → New key |
| GROQ_API_KEY | Every 90 days | Console → New key |

### Verification
After each rotation:
```bash
npm run cli -- health
npm run cli -- check-llm
docker compose restart bot
docker logs discord-bot --tail 10
```
