# Guide de Configuration — Alertes de Jeux Gratuits

## Vue d'ensemble

Le bot peut surveiller automatiquement le flux RSS de **r/FreeGameFindings** (Reddit) et poster une alerte dans un salon Discord à chaque nouveau jeu gratuit détecté, **toutes les 30 minutes**.

Plateformes supportées (détection par mots-clés dans le titre Reddit) :
- **Epic Games Store** (vert)
- **Steam** (bleu)
- **PlayStation Store** (bleu PlayStation)
- **Xbox / Microsoft Store** (vert Xbox)
- **Nintendo eShop** (rouge)

Chaque embed est coloré dynamiquement selon la plateforme détectée, avec le logo et le lien du store officiel.

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Étape 1 — Créer le salon Discord](#étape-1--créer-le-salon-discord)
4. [Étape 2 — Récupérer l'ID du salon](#étape-2--récupérer-lid-du-salon)
5. [Étape 3 — (Optionnel) Rôle à mentionner](#étape-3--optionnel-créer-ou-récupérer-le-rôle-à-mentionner)
6. [Étape 4 — Configurer `.env`](#étape-4--configurer-le-fichier-env)
7. [Étape 5 — Redémarrer](#étape-5--redémarrer-le-bot)
8. [Étape 6 — Vérification](#étape-6--vérification)
9. [Dépannage](#dépannage)
10. [Personnalisation avancée](#personnalisation-avancée)
11. [Architecture interne](#architecture-interne)
12. [Voir aussi](#voir-aussi)

---
## Prérequis

- Bot Discord déjà configuré et fonctionnel (voir `POSTGRES_MIGRATION.md` et le `.env` principal)
- Droits de **Manage Channels** sur le serveur où vous créez le salon
- (Optionnel) Un rôle à mentionner pour notifier les membres

---

## Étape 1 — Créer le salon Discord

1. Sur votre serveur Discord, faites **clic droit sur la catégorie** où vous voulez recevoir les alertes (par ex. `#alertes` ou `#jeux-gratuits`).
2. **Créer un salon** → **Salon textuel**.
3. Nommez-le par exemple : `free-games` ou `jeux-gratuits`.
4. **Permissions du salon** (⚠️ important) :
   - `@everyone` : `Voir le salon` ✅, `Envoyer des messages` ❌ (pour éviter le spam)
   - Votre bot : `Voir le salon` ✅, `Envoyer des messages` ✅, **Inclure dans les embeds** ✅, `Utiliser des emojis externes` ✅, `Lire l'historique des messages` ✅, `Utiliser les commandes slash` ✅
   - (Optionnel) Le rôle à mentionner : `Voir le salon` ✅

> 💡 **Astuce** : Si vous voulez que seuls certains rôles voient les alertes, rendez le salon privé (permissions `@everyone` = `Voir le salon` ❌) et ajoutez explicitement les rôles autorisés.

---

## Étape 2 — Récupérer l'ID du salon

1. Activer le **Mode développeur** dans Discord :
   - **Discord** → ⚙️ **Paramètres** → **Avancés** → **Mode développeur** ✅
2. **Clic droit sur le salon** créé → **Copier l'identifiant du salon**.
3. Vous obtenez un identifiant numérique à 17-20 chiffres (par ex. `1515100689766940875`).

---

## Étape 3 — (Optionnel) Créer ou récupérer le rôle à mentionner

Si vous voulez notifier un rôle spécifique à chaque nouveau jeu (ex. `@FreeGames` ou `@Gamers`) :

1. **Paramètres du serveur** → **Rôles** → **Créer un rôle**.
2. Nommez-le (par ex. `Free Games`) et configurez ses permissions.
3. **Clic droit sur le rôle** → **Copier l'identifiant du rôle**.
4. ⚠️ Le rôle **DOIT être mentionné** (`Allow anyone to mention`) sinon Discord bloquera la mention.

> ⚠️ **Sécurité** : N'utilisez **JAMAIS** `@everyone` ici — laissez `FREE_GAMES_MENTION_ROLE` vide si vous ne voulez pas de mention globale. Le bot accepte uniquement un ID de rôle spécifique.

---

## Étape 4 — Configurer le fichier `.env`

Ouvrez votre fichier `.env` à la racine du projet et ajoutez (ou modifiez) :

```env
# ── Alertes de Jeux Gratuits (Reddit r/FreeGameFindings) ─────────────────────────────
# ID du salon où poster les alertes (obligatoire)
FREE_GAMES_CHANNEL_ID=1515100689766940875

# ID du rôle à mentionner à chaque alerte (optionnel — laissez vide pour aucune mention)
FREE_GAMES_MENTION_ROLE=
```

> 📝 Le format est `FREE_GAMES_CHANNEL_ID=<id>` sans guillemets, sans espace.

---

## Étape 5 — Redémarrer le bot

### Option A — Docker Compose (recommandé)
```bash
docker compose restart bot
docker compose logs -f bot | grep -i free
```

### Option B — Natif (Windows)
```bat
restart.bat
```

### Option C — PM2
```bash
pm2 restart discord-bot
pm2 logs discord-bot | grep -i free
```

Au démarrage, vous devez voir dans les logs :
```
[FreeGamesCron] ⏱️ Exécution Cron planifiée pour Jeux Gratuits — toutes les 30 minutes
```

Si la variable est absente, vous verrez à la place :
```
[FreeGamesCron] FREE_GAMES_CHANNEL_ID manquant ou non défini — alertes de jeux gratuits désactivées
```

---

## Étape 6 — Vérification

### Test manuel immédiat

⚠️ **Important** : le cron est planifié via `cron.schedule("*/30 * * * *", ...)` et s'exécute **uniquement aux minutes 0 et 30** de chaque heure. Un redémarrage du bot à 14h37 ne déclenche AUCUN cycle immédiat — il faut attendre 14h30 ou 15h00.

Pour forcer un test sans attendre :
- Soit attendre la prochaine exécution planifiée (max 30 min)
- Soit créer une commande admin `/test-freegames` (cf. section Personnalisation)

### Vérifier que le salon reçoit bien les alertes

1. Attendez le prochain cycle (max 30 min).
2. Vérifiez qu'un **embed coloré** apparaît dans le salon `free-games` :
   - Titre : nom du jeu avec emoji 🎮
   - Auteur : logo + nom du store (Epic, Steam, etc.)
   - Couleur : vert pour Epic, bleu pour Steam, rouge pour Nintendo, etc.
   - Champs : date de publication, lien Reddit, plateforme
3. Si un rôle est configuré, il doit être mentionné en haut du message.

### Tester avec un post Reddit réel

Allez sur https://www.reddit.com/r/FreeGameFindings/new/ et vérifiez qu'il y a bien des posts récents. Le cron prend en charge les posts avec les motifs suivants dans le titre :
- `[Epic Games]`, `[Steam]`, `[PlayStation]`/`[PS4]`/`[PS5]`, `[Xbox]`/`[XBL]`, `[Nintendo]`/`[Switch]`

Les autres plateformes (GOG, Humble, etc.) sont **ignorées** par le bot.

---

## Dépannage

### Le salon ne reçoit rien

| Cause probable | Solution |
|---|---|
| `FREE_GAMES_CHANNEL_ID` absent ou mal écrit | Vérifier le `.env`, pas d'espace, format `123456789012345678` |
| Le bot n'a pas accès au salon | Vérifier les permissions du bot dans **Paramètres du salon** → **Permissions** |
| Le bot n'est pas sur le serveur | L'inviter via OAuth2 avec le scope `bot` |
| Le cron n'est pas démarré | Vérifier les logs au démarrage : `startFreeGamesMonitoring` doit être appelé |
| Redis est down | Le cron tolère un Redis down mais les déduplications ne marcheront plus. Vérifier `docker compose ps redis` |

### Les messages apparaissent dans le mauvais salon

Vous avez peut-être plusieurs variables `FREE_GAMES_*` dans le `.env`. Vérifiez qu'il n'y a qu'**une seule** ligne `FREE_GAMES_CHANNEL_ID=`.

### Le rôle n'est pas mentionné

1. Vérifier que `FREE_GAMES_MENTION_ROLE` contient bien un **ID numérique** (pas `<@&123>` ni `@Rôle`).
2. Vérifier que le rôle a l'option **"Autoriser n'importe qui à mentionner"** activée dans ses paramètres.
3. Si le rôle est au-dessus du bot dans la hiérarchie, il sera quand même mentionné (Discord le permet), mais le bot ne pourra pas le gérer.

### Erreur "Unknown Channel" dans les logs

L'ID du salon est incorrect ou le salon a été supprimé. Recréez le salon et mettez à jour `FREE_GAMES_CHANNEL_ID`.

### Le bot poste des doublons

Si Redis perd ses données (par ex. après `FLUSHDB`), les anciens GUIDs Reddit ne sont plus en cache et le bot peut reposter. Les doublons s'arrêteront au cycle suivant. Solution définitive : ne pas flusher Redis en production.

---

## Personnalisation avancée

### Changer la cadence de détection

Éditez `src/cron/freeGamesCron.ts`, cherchez :
```typescript
cronJob = cron.schedule("*/30 * * * *", () => { ... });
```

Remplacez `"*/30 * * * *"` par l'expression cron de votre choix :
- `*/15 * * * *` — toutes les 15 minutes
- `0 */2 * * *` — toutes les 2 heures
- `0 9 * * *` — tous les jours à 9h

> ⚠️ Une cadence trop agressive (< 5 min) peut trigger le rate-limit de Reddit.

### Ajouter une nouvelle plateforme

Éditez `src/cron/freeGamesCron.ts` :
1. Ajoutez le type dans `type Platform = ...`.
2. Ajoutez l'entrée dans `PLATFORM_CONFIGS` (couleur, icône, storeUrl).
3. Ajoutez la détection dans `detectPlatform(title)`.

### Désactiver complètement la fonctionnalité

Mettez `FREE_GAMES_CHANNEL_ID=` (vide) dans le `.env`. Le cron s'exécutera toujours mais ne fera rien (sécurité anti-crash).

---

## Architecture interne

Pour information, le pipeline de détection est :

1. **Cron** → toutes les 30 min, appelle `checkFreeGames(client)`
2. **Fetch RSS** → récupère les posts de r/FreeGameFindings
3. **Déduplication** → filtre via Prisma (`processedFreeGames`) sur le `guid` Reddit
4. **Détection plateforme** → regex sur le titre
5. **Envoi embed** → dans le salon configuré, avec couleur/logo dynamique
6. **Persistance** → enregistre le `guid` pour éviter les doublons

Variables internes (ne pas modifier) :
- `RSS_FEED_URL` : `https://www.reddit.com/r/FreeGameFindings/new/.rss`
- Table Prisma : `processedFreeGames(redditPostId, title, createdAt)`

---

## Voir aussi

- `POSTGRES_MIGRATION.md` — migration SQLite → PostgreSQL (en cours, non finalisé)
- `WHITELIST_GUIDE.md` — configuration du flux Twitter (xcancel)
- `.env.example` — toutes les variables d'environnement
- `src/cron/freeGamesCron.ts` — code source
