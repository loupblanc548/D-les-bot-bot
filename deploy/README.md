# Déploiement VPS OVH — Discord Bot

## Étape 1 — Commander le VPS

1. Va sur https://www.ovh.com/fr/vps/
2. Choisis **VPS Starter** (4 GB RAM, 2 vCPU, 40 GB SSD) — **3.50€/mois**
3. OS: **Ubuntu 24.04 LTS**
4. Datacenter: **Gravelines** (France)
5. Attends l'email avec les identifiants SSH

## Étape 2 — Se connecter au VPS

```bash
ssh root@VPS_IP
```
*(Remplace VPS_IP par l'IP dans l'email OVH)*

## Étape 3 — Installer le bot

```bash
apt update -y && apt install -y git
git clone https://github.com/loupblanc548/D-les-bot-bot.git /tmp/bot
cd /tmp/bot
bash deploy/install.sh
```

Le script installe automatiquement:
- Node.js 22 LTS
- PostgreSQL 16
- Redis
- Pare-feu UFW
- Le bot dans /opt/discord-bot
- Service systemd (démarrage auto + restart au crash)

## Étape 4 — Configurer les tokens

```bash
nano /opt/discord-bot/.env
```

Remplis ces valeurs obligatoires:
- `DISCORD_TOKEN` — ton token Discord bot
- `GUILD_ID` — l'ID de ton serveur
- `OPENROUTER_API_KEY` — ta clé OpenRouter
- Les `*_CHANNEL_ID` — les IDs des salons Discord

Sauvegarde: Ctrl+X, Y, Enter

## Étape 5 — Démarrer le bot

```bash
systemctl start discord-bot
systemctl status discord-bot
```

## Étape 6 — Vérifier les logs

```bash
journalctl -u discord-bot -f
```

Tu devrais voir:
```
[GlobalPatchNotes] Cron démarré — toutes les 5 minutes
[Monitor] Surveillance activée
[Feeds] Démarrage des feeds...
```

## Commandes utiles

| Action | Commande |
|--------|----------|
| Démarrer | `systemctl start discord-bot` |
| Arrêter | `systemctl stop discord-bot` |
| Redémarrer | `systemctl restart discord-bot` |
| Statut | `systemctl status discord-bot` |
| Logs live | `journalctl -u discord-bot -f` |
| Logs (100 dernières lignes) | `journalctl -u discord-bot -n 100` |
| Mettre à jour le bot | `cd /opt/discord-bot && bash deploy/update.sh` |

## Sécurité

Le pare-feu UFW est configuré automatiquement:
- SSH (port 22): ouvert
- Tout le reste entrant: bloqué
- Sortant: tout autorisé

Recommandations supplémentaires:
```bash
# Changer le port SSH (optionnel mais recommandé)
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
systemctl restart sshd

# Désactiver login root par mot de passe (après avoir configuré une clé SSH)
sed -i 's/#PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart sshd
```

## Différences avec le local

| Composant | Local (ton PC) | VPS OVH |
|-----------|---------------|---------|
| Ollama (GPU) | ✅ 4060 Ti | ❌ (fallback OpenRouter) |
| PostgreSQL | Neon (cloud) | Local (même machine) |
| Redis | Optionnel | Local (même machine) |
| 24/7 | ❌ (PC éteint = bot éteint) | ✅ |
| Impact jeux | Léger | Aucun |

## Backup DB

```bash
# Sauvegarde manuelle
pg_dump -U discord_bot discord_bot > backup_$(date +%Y%m%d).sql

# Sauvegarde automatique (cron quotidien)
echo "0 3 * * * pg_dump -U discord_bot discord_bot > /opt/backups/bot_$(date +\%Y\%m\%d).sql" | crontab -
mkdir -p /opt/backups
```
