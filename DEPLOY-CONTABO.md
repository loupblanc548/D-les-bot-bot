# Déploiement sur Contabo (VPS)

## 1. Prérequis

```bash
# Node.js 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2

# Git
sudo apt-get install -y git
```

## 2. Cloner le bot

```bash
cd /opt
git clone https://github.com/loupblanc548/D-les-bot-bot.git bot
cd bot
```

## 3. Installer les dépendances

```bash
npm install
npx prisma generate
```

## 4. Configuration

```bash
cp .env.example .env
nano .env
```

Variables obligatoires :
- `DISCORD_TOKEN` — token du bot
- `DISCORD_CLIENT_ID` — ID client du bot
- `OWNER_ID` — ton ID Discord
- `OPENROUTER_API_KEY` — clé API OpenRouter
- `DATABASE_URL` — URL PostgreSQL
- `DIRECT_URL` — URL PostgreSQL directe (pour migrations)

Variables importantes :
- `ENABLE_NOTIFICATIONS` — mettre `true` pour recevoir les DMs (désactivé par défaut)
- `GAMING_CHANNEL_ID` — salon où poster les défis + trivia quotidiens
- `LOG_CHANNEL_ID` — salon de logs
- `CRASH_WEBHOOK_URL` — webhook Discord pour alertes critiques

## 5. Migrations base de données

```bash
npx prisma migrate deploy
```

## 6. Démarrer avec PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # suivre les instructions affichées
```

## 7. Vérifier

```bash
pm2 logs john-helldiver --lines 30
pm2 status
```

## 8. Mise à jour

```bash
cd /opt/bot
pm2 stop john-helldiver
git pull origin main
npm install
npx prisma generate
npx prisma migrate deploy
pm2 restart john-helldiver --update-env
pm2 logs john-helldiver --lines 20
```

## 9. Activer les DMs (optionnel)

Par défaut, le bot n'envoie **aucun DM** à l'owner. Pour les activer :

```bash
# Option A : fichier
touch .enable-notifications
pm2 restart john-helldiver

# Option B : variable d'environnement
# Éditer .env et mettre :
ENABLE_NOTIFICATIONS=true
pm2 restart john-helldiver --update-env
```

Pour les désactiver à nouveau :
```bash
rm .enable-notifications
# OU mettre ENABLE_NOTIFICATIONS=false dans .env
pm2 restart john-helldiver --update-env
```

## 10. Anti-crash loop

PM2 est configuré avec :
- `max_restarts: 3` — max 3 redémarrages
- `min_uptime: 60s` — doit tourner 60s minimum
- `restart_delay: 15s` — 15s entre chaque restart
- `exp_backoff_restart_delay: 200` — backoff exponentiel

Si le bot crash 3 fois en moins de 60s, PM2 arrête de le redémarrer.
Vérifier les logs : `pm2 logs john-helldiver --err --lines 50`

## 11. Redis (optionnel)

Le bot fonctionne sans Redis (fallback sur cache local). Pour l'activer :

```bash
sudo apt-get install -y redis-server
# Redis démarre automatiquement sur localhost:6379
```

## 12. Logs

```bash
# Logs temps réel
pm2 logs john-helldiver

# Logs d'erreur seulement
pm2 logs john-helldiver --err

# 100 dernières lignes
pm2 logs john-helldiver --lines 100

# Les fichiers de log sont dans ./logs/
tail -f logs/pm2-error.log
```
