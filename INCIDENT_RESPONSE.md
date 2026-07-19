# INCIDENT_RESPONSE.md

## Procédure d'urgence — Compromission ou incident critique

### 1. Couper l'accès (Kill Switch)

```bash
# SSH au VPS
ssh -i ~/.ssh/contabo_bot root@31.220.79.90

# Arrêter le bot immédiatement
systemctl stop discord-bot

# Couper l'accès réseau externe (garde SSH)
ufw deny 3000/tcp
ufw deny 3005/tcp
ufw deny 3006/tcp
```

### 2. Révoquer les clés compromises

| Ressource | Action | Commande/URL |
|-----------|--------|--------------|
| **Discord Token** | Régénérer | Discord Developer Portal → Bot → Reset Token |
| **OpenRouter API Key** | Révoquer | https://openrouter.ai/keys |
| **OpenAI API Key** | Révoquer | https://platform.openai.com/api-keys |
| **Groq API Key** | Révoquer | https://console.groq.com/keys |
| **Gemini API Key** | Révoquer | Google AI Studio → API Keys |
| **Cohere API Key** | Révoquer | https://dashboard.cohere.com/api-keys |
| **Brave API Keys** | Révoquer | https://api.search.brave.com/applications |
| **Steam API Key** | Révoquer | https://steamcommunity.com/dev/apikey |
| **SteamGridDB API Key** | Révoquer | https://www.steamgriddb.com/profile/preferences |
| **Database URL (Neon)** | Rotation | Neon Console → Settings → Connection → Reset password |
| **GitHub PAT** | Révoquer | GitHub → Settings → Developer settings → Tokens → Delete |
| **Control Token** | Régénérer | Générer nouveau token, mettre à jour `.env` sur VPS |

### 3. Isolation réseau

```bash
# Bloquer tout trafic sortant sauf SSH
ufw default deny outgoing
ufw allow out 22/tcp
ufw reload
```

### 4. Vérification d'intégrité

```bash
# Vérifier les processus suspects
ps aux | grep -v -E '(sshd|systemd|node|prometheus|fail2ban|rsyslog|cron|dbus|kthread)'

# Vérifier les connexions actives
ss -tunap | grep ESTABLISHED

# Vérifier les modifications récentes
find /opt/discord-bot -mtime -1 -type f

# Vérifier crontab
crontab -l

# Vérifier authorized_keys
cat /root/.ssh/authorized_keys
cat /home/ubuntu/.ssh/authorized_keys 2>/dev/null
```

### 5. Restauration

```bash
# Restaurer la DB depuis le dernier backup
pg_dump_restore() {
  LATEST=$(ls -t /opt/backups/db_*.dump 2>/dev/null | head -1)
  if [ -z "$LATEST" ]; then
    echo "No backup found — check Neon console for PITR"
    return 1
  fi
  DB_URL=$(grep DATABASE_URL /opt/discord-bot/.env | cut -d'=' -f2- | tr -d '"')
  pg_restore --dbname "$DB_URL" --clean --if-exists "$LATEST"
}

# Redémarrer le bot
systemctl start discord-bot
systemctl status discord-bot
```

### 6. Contacts

- **Owner**: @loupblanc548 (Discord + GitHub)
- **VPS Provider**: Contabo Support — https://contabo.com/en/support/
- **DB Provider**: Neon Support — https://neon.tech/docs/introduction/support

### 7. Post-incident

1. Changer TOUS les mots de passe (VPS root, GitHub, Discord, API keys)
2. Activer 2FA sur tous les comptes
3. Analyser les logs: `journalctl -u discord-bot --since "incident time"`
4. Vérifier les logs d'auth: `cat /var/log/auth.log | grep "Failed password"`
5. Documenter l'incident dans ce fichier
