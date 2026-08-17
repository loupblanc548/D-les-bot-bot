# Runbook de Déploiement

## Pre-deploy Checklist

1. Vérifier que `npm run build` passe localement sans erreur
2. Vérifier que `npm run lint` ne rapporte pas d'erreurs critiques
3. Vérifier que les tests `npm run test:ci` passent
4. Confirmer que les variables d'environnement sont à jour dans `.env` (VPS, Railway, Neon)
5. Vérifier que les secrets ne sont pas commités (`git log --all --diff-filter=D -- '*.env'`)

## Post-deploy Checks

1. Vérifier que le bot est en ligne: `docker logs discord-bot --tail 5`
2. Vérifier le health endpoint: `curl http://localhost:3000/health`
3. Vérifier les métriques: `curl http://localhost:3005/metrics`
4. Vérifier que le LLM local est détecté: `docker logs discord-bot 2>&1 | grep LocalLLM`
5. Vérifier la mémoire: `docker stats --no-stream discord-bot`
6. Tester une commande Discord: `@John Helldiver ping`

## Rollback Steps

1. `docker compose down bot`
2. `git checkout <previous-commit-hash>`
3. `docker compose build bot`
4. `docker compose up -d bot`
5. Vérifier les logs pour confirmer le rollback

## Rotation de Secrets

### Discord Token

1. Aller sur https://discord.com/developers/applications
2. Sélectionner le bot → Token → Reset Token
3. Mettre à jour `DISCORD_TOKEN` dans `.env` sur tous les environnements
4. Redémarrer le bot: `docker compose restart bot`

### Database (Neon)

1. Console Neon → Branch → Reset password
2. Mettre à jour `DATABASE_URL` dans `.env`
3. Redémarrer: `docker compose restart bot`

### OpenRouter API Key

1. https://openrouter.ai/keys → Create new key
2. Mettre à jour `OPENROUTER_API_KEY` dans `.env`
3. Redémarrer le bot

### Telegram Bot Token

1. @BotFather → /revoke → sélectionner le bot
2. Mettre à jour `TELEGRAM_BOT_TOKEN` dans `.env`
3. Redémarrer le bot

### Groq API Key

1. https://console.groq.com/keys → Create new key
2. Mettre à jour `GROQ_API_KEY` dans `.env`
3. Redémarrer le bot
