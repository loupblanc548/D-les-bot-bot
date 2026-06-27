# Variables d'environnement — Outils externes

Toutes les variables sont **optionnelles**. Si elles ne sont pas définies, les fonctionnalités correspondantes sont désactivées (no-op).

## Healthchecks.io — Monitoring des crons externe
```env
HEALTHCHECKS_BASE_URL=https://hc-ping.com/votre-uuid
```
Créer un compte sur https://healthchecks.io, créer un check par cron.

## rclone — Sync backups vers le cloud
```env
RCLONE_REMOTE=my-s3:bot-backups
```
Installer rclone + `rclone config` pour créer un remote (S3, B2, Google Drive...).

## pm2-logrotate — Rotation des logs
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```
Voir `scripts/setup-logrotate.sh`.

## VirusTotal — Scan d'URLs anti-phishing
```env
VIRUSTOTAL_API_KEY=your-api-key
```
Obtenir une clé gratuite sur https://www.virustotal.com/gui/my-apikey (4 req/min, 500/jour).

## Hugging Face — Fallback AI gratuit
```env
HF_API_TOKEN=your-token  # Optionnel, augmente les limites
```
Sans token: 1000 req/jour. Avec token: limites plus élevées.
https://huggingface.co/settings/tokens

## ntfy.sh — Alertes push téléphone
```env
NTFY_TOPIC=mon-bot-alerts
NTFY_SERVER=https://ntfy.sh  # Optionnel, defaut: ntfy.sh
```
Installer l'app ntfy sur téléphone, s'abonner au topic.
https://ntfy.sh

## IGDB — Métadonnées jeux vidéo
```env
TWITCH_CLIENT_ID=your-client-id      # Déjà utilisé par Twitch monitoring
TWITCH_CLIENT_SECRET=your-secret      # Déjà utilisé par Twitch monitoring
```
Créer une app sur https://dev.twitch.tv/console (réutilise les credentials Twitch existants).

## DeepL — Traduction haute qualité
```env
DEEPL_API_KEY=your-api-key
```
Plan gratuit: 500k caractères/mois.
https://www.deepl.com/pro-api

## Have I Been Pwned — Check emails/mots de passe
```env
HIBP_API_KEY=your-api-key
```
Usage non-commercial gratuit.
https://haveibeenpwned.com/API/Key
Note: `checkPassword()` ne nécessite PAS de clé API.

## SMTP2GO — Rapports par email
```env
SMTP2GO_API_KEY=your-api-key
REPORT_EMAIL_TO=owner@example.com
REPORT_EMAIL_FROM=bot@example.com
```
Plan gratuit: 1000 emails/mois.
https://www.smtp2go.com

## UptimeRobot — Monitoring externe
Déjà implémenté via le serveur HTTP `/health` sur le port 3000.
Créer un monitor sur https://uptimerobot.com:
- URL: `http://votre-serveur:3000/health`
- Interval: 5 minutes
- Alert: email/Discord webhook

## Litestream — Réplication SQLite
Voir `docs/litestream-setup.md` pour la configuration complète.
