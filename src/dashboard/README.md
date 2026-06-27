# Shadow Broker — Dashboard Electron

## Démarrage rapide

```bash
# 1. Configurer les variables d'environnement dans .env
DISCORD_CLIENT_SECRET=your_secret_here
JWT_SECRET=your_long_random_string_here
DASHBOARD_REDIRECT_URI=http://localhost:3721/api/auth/callback

# 2. Configurer le Discord Developer Portal
#    OAuth2 → Redirect URI → http://localhost:3721/api/auth/callback

# 3. Lancer le dashboard
npm run dashboard

# En mode développement (avec DevTools)
npm run dashboard:dev
```

## Architecture

```
src/dashboard/
├── main.ts          — Process principal Electron (crée la fenêtre)
├── preload.ts       — Script de préchargement (contextBridge)
├── server.ts        — Serveur Express (OAuth2 + API REST)
├── launcher.ts      — Script de lancement (npm run dashboard)
└── frontend/
    ├── index.html   — Structure HTML
    ├── styles.css   — Thème Matrix (vert #00ff41)
    └── app.js        — Logique frontend (vanilla JS)
```

## Routes API

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/auth/discord` | Redirige vers Discord OAuth2 |
| GET | `/api/auth/callback` | Callback OAuth2 Discord |
| GET | `/api/auth/logout` | Déconnexion |
| GET | `/api/user` | Profil utilisateur |
| GET | `/api/guilds` | Serveurs (admin + bot présent) |
| GET | `/api/guilds/:id` | Config d'un serveur |
| POST | `/api/guilds/:id/settings` | Modifier config serveur |
| GET | `/api/bot/stats` | Stats globales |
| GET | `/api/bot/health` | Health check |

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `DISCORD_CLIENT_SECRET` | Secret OAuth2 (Developer Portal → OAuth2) |
| `JWT_SECRET` | Clé secrète pour les sessions |
| `DASHBOARD_REDIRECT_URI` | URL de callback OAuth2 |

## Onglets du Dashboard

- **Général** — Préfixe, langue, salon logs, mode sombre
- **Modération** — Rôles mod/admin, auto-ban, anti-raid
- **Logs** — Salon logs, types de logs activés
- **Niveaux** — Système XP, salon annonces, cooldown
- **Bienvenue** — Messages de bienvenue personnalisés
- **Auto-Mod** — Filtres anti-insultes, spam, caps, links
- **OSINT** — Configuration Shadow Broker
- **Statistiques** — Stats globales du bot

## Thème

Matrix/Hacker vert — `#00ff41` comme couleur principale.
Effet "matrix rain" sur l'écran de connexion.
