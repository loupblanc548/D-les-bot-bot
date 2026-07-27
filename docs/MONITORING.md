# Monitoring Externe — Configuration

## Endpoint de healthcheck

Le bot expose un endpoint HTTP sur le port 7890 (configurable via `HEALTH_PORT`):

```
GET http://127.0.0.1:7890/health
```

Réponse JSON:
```json
{
  "status": "ok",
  "timestamp": "2026-07-27T03:09:52.552Z",
  "uptime_hours": 2,
  "services": {
    "ollama": true,
    "piper_tts": true
  },
  "llm_stats": {
    "total_messages": 15,
    "local_handled": 12,
    "api_handled": 3,
    "local_percentage": 80,
    "delegated": 1,
    "estimated_savings_tokens": 4500,
    "estimated_savings_eur": 0.03
  },
  "tts_stats": {
    "piper_used": 8,
    "api_used": 0
  }
}
```

## Configuration UptimeRobot (gratuit)

1. Créer un compte sur https://uptimerobot.com
2. Ajouter un nouveau monitor:
   - **Type**: HTTP(s)
   - **URL**: `http://31.220.79.90:7890/health`
   - **Interval**: 5 minutes
   - **Timeout**: 30 secondes
3. Configurer les alertes:
   - **Email**: activer
   - **Slack/Discord webhook** (optionnel): créer un webhook Discord et l'ajouter dans UptimeRobot
4. UptimeRobot enverra une alerte si:
   - Le bot ne répond pas pendant 3 checks consécutifs (15 min)
   - Le status code n'est pas 200

## Configuration Better Stack (alternative)

1. Créer un compte sur https://betterstack.com (offre gratuite 10 monitors)
2. Ajouter un monitor HTTP:
   - **URL**: `http://31.220.79.90:7890/health`
   - **Check frequency**: 5 min
3. Configurer les escalations:
   - **Email** + **Discord webhook** + **SMS** (optionnel)

## Sécurité de l'endpoint

L'endpoint écoute sur `127.0.0.1` uniquement (localhost). Pour permettre à UptimeRobot d'y accéder depuis Internet:

### Option A: Reverse proxy nginx (recommandé)

```nginx
server {
    listen 80;
    server_name health.tondomaine.com;

    location /health {
        proxy_pass http://127.0.0.1:7890/health;
        proxy_set_header Host $host;
        # Rate limiting basique
        limit_req zone=health burst=5 nodelay;
    }
}
```

Ajouter dans `nginx.conf`:
```nginx
limit_req_zone $binary_remote_addr zone=health:10m rate=10r/m;
```

### Option B: Tunnel Cloudflare

```bash
cloudflared tunnel --url http://127.0.0.1:7890
```

Cloudflare fournit une URL publique qui pointe vers localhost, avec protection DDoS intégrée.

### Option C: Tailscale Funnel

```bash
tailscale funnel 7890
```

Expose le port 7890 via Tailscale avec HTTPS automatique.

## Alertes recommandées

| Condition | Sévérité | Action |
|-----------|---------|--------|
| Bot ne répond pas (3 checks) | Critique | Vérifier VPS + redémarrer |
| `ollama: false` | Warning | Ollama down, fallback API actif |
| `piper_tts: false` | Info | TTS local down, fallback API actif |
| `uptime_hours` < 0.1 | Warning | Bot redémarré récemment |
