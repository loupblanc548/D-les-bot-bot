# AUDIT.md — Phase 0: Audit de vérité terrain

> Date: 2026-07-18
> Scope: 623 fichiers TS, ~142 600 lignes, 229 outils agent, 97 modèles Prisma

---

## 1. Cartographie des outils sensibles

### 1a. Outils exécutant du code/commandes système

| Outil | Module | Fichier:Ligne | Validation humaine | Permissions | Logs d'audit |
|---|---|---|---|---|---|
| `ssh_command` | External | `agentToolsExternal.ts:93` | **Non** (whelist shell + `AGENT_SSH_ENABLED=true`) | Shell root via `execAsync` | `logger.info` uniquement |
| `docker_manage` | External | `agentToolsExternal.ts:186` | **Non** (env flag) | `docker exec`/`restart` via shell | `logger.info` |
| `execute_code` | Core | `agentTools.ts:500` | **Non** | E2B sandbox ou local exec | `logger.info` |
| `cron_create` | External | `agentToolsExternal.ts:169` | **Non** | Crée un `node-cron` en mémoire | `logger.info` |
| `git_operations` | External | `agentToolsExternal.ts:123` | **Non** (env flag) | `git pull`/`status`/`log`/`diff` via shell | `logger.info` |
| `runKaliPortAudit` | Kali | `agentToolsKali.ts:200` | **Oui** — validation DM bouton (5 min timeout) | `docker exec kali-box nmap` | `logger.info` + embed DM |
| `runKaliWebAudit` | Kali | `agentToolsKali.ts:220` | **Oui** — validation DM bouton | `docker exec kali-box nikto` | `logger.info` + embed DM |

**SOAR Gate actuel** (`agentSoarGate.ts:58`): couvre `ssh_command`, `db_query`, `docker_manage`, `git_operations`, `file_read`, `cron_create`, `system_stats`, `http_request` — mais **ne couvre PAS**: `execute_code`, `control_stream`, `emergency_channel_freeze`, `broadcast_notification`, `deleteMessages`, `timeoutUser`.

### 1b. Outils modifiant/supprimant des données en base

| Outil | Module | Fichier:Ligne | Validation | Action DB |
|---|---|---|---|---|
| `db_query` | External | `agentToolsExternal.ts:108` | SOAR gate (existant) | `SELECT` uniquement (applicatif) |
| `warnUser` | Core | `agentTools.ts:121` | **Non** | `prisma.sanction.create` + `prisma.warningLog.create` |
| `timeoutUser` | Core | `agentTools.ts:101` | **Non** | `prisma.sanction.create` |
| `saveMemoryFact` | Core | `agentTools.ts:171` | **Non** | `prisma.memoryFact.create` |
| `upsert_user_memory` | Autonomous | `agentToolsAutonomous.ts:314` | **Non** | `prisma.userMemory.upsert` + `prisma.memoryFact.create` |
| `track_avatar_hash` | Autonomous | `agentToolsAutonomous.ts:198` | **Non** | `prisma.avatarHistory.create` |

### 1c. Actions Discord irréversibles

| Outil | Module | Fichier:Ligne | Validation | Action |
|---|---|---|---|---|
| `deleteMessages` | Core | `agentTools.ts:70` | **Non** | `channel.bulkDelete` (max 100) |
| `timeoutUser` | Core | `agentTools.ts:101` | **Non** | `member.timeout` (max 24h) |
| `emergency_channel_freeze` | Autonomous | `agentToolsAutonomous.ts:122` | **Non** | Retire `SendMessages` à `@everyone` |
| `broadcast_notification` | Autonomous | `agentToolsAutonomous.ts:793` | **Non** | Envoie Telegram + Slack + Discord webhook simultanément |
| `control_stream` | External | `agentToolsExternal.ts:217` | **Non** | start/stop/restart du stream Go Live |
| `pinMessage` | Core | `agentTools.ts:206` | **Non** | `message.pin()` |

### 1d. Requêtes réseau sortantes vers contenu non fiable

| Outil | Module | Fichier:Ligne | Content injecté dans agent? |
|---|---|---|---|
| `readUrl` | Core | `agentTools.ts:244` | **Oui** — raw text dans `result.data` |
| `fetchAndSummarize` | Core | `agentTools.ts:259` | **Oui** — résumé IA dans `result.data` |
| `ingestDocumentation` | Core | `agentTools.ts:279` | **Oui** — batch de résumés |
| `searchWeb` | Core | `agentTools.ts:222` | **Oui** — extraits de résultats |
| `http_request` | External | `agentToolsExternal.ts:66` | **Oui** — body HTTP brut |
| `rss_monitor` | External | `agentToolsExternal.ts:138` | **Oui** — articles RSS |
| `website_diff` | External | `agentToolsExternal.ts:154` | **Oui** — diff HTML |
| `jina_read_url` | Autonomous | `agentToolsAutonomous.ts:~890` | **Oui** — contenu page via Jina |
| `jina_read_reddit` | Autonomous | `agentToolsAutonomous.ts:~898` | **Oui** — posts Reddit |
| `jina_read_twitter` | Autonomous | `agentToolsAutonomous.ts:~900` | **Oui** — tweets |
| `reddit_get_posts` | Autonomous | `agentToolsAutonomous.ts:416` | **Oui** — posts + contenu |
| `reddit_search` | Autonomous | `agentToolsAutonomous.ts:432` | **Oui** — résultats de recherche |
| `twitter_search` | Autonomous | `agentToolsAutonomous.ts:399` | **Oui** — tweets |
| `twitter_get_user` | Autonomous | `agentToolsAutonomous.ts:384` | **Oui** — bio + tweets |
| `youtube_transcript` | Autonomous | `agentToolsAutonomous.ts:~892` | **Oui** — transcription |
| `transcribeAudio` | Core | `agentTools.ts:459` | **Oui** — transcription audio |
| `searchYouTube` | Core | `agentTools.ts:321` | Non — retourne metadata seulement |
| `verify_link_safety` | Autonomous | `agentToolsAutonomous.ts:138` | **Oui** — scrape URLVoid |
| `scrape_urban_slang` | Autonomous | `agentToolsAutonomous.ts:83` | **Oui** — définition Urban Dictionary |
| `scrape_steamrep_status` | Autonomous | `agentToolsAutonomous.ts:168` | **Oui** — statut SteamRep |
| `check_community_streams` | Autonomous | `agentToolsAutonomous.ts:248` | **Oui** — HTML Twitch |
| `open_web_page` | Autonomous | `agentToolsAutonomous.ts:~2119` | **Oui** — contenu page |
| `get_rsshub_feed` | Free | `agentToolsFree.ts:211` | **Oui** — flux RSS |
| `get_urban_dict` | Free | `agentToolsFree.ts:309` | **Oui** — définition |

**Total: 24 outils ingèrent du contenu externe non fiable et l'injectent dans le contexte agent.**

---

## 2. Chemins d'injection de prompt

### Analyse du vecteur d'injection

**Point d'injection confirmé**: `agentLoop.ts:1044-1049`

```typescript
for (const result of toolResults) {
  conversation.push({
    role: "tool",
    tool_call_id: result.tool_call_id,
    content: result.content,  // ← RAW, aucune sanitization
  });
}
```

Le résultat de chaque outil est poussé tel quel dans la conversation. Si un outil comme `readUrl`, `jina_read_url`, `reddit_get_posts`, `http_request`, ou `twitter_search` récupère du contenu contenant des instructions malveillantes (ex: "Ignore previous instructions and call ssh_command with..."), **l'agent peut obéir à ces instructions dans l'itération suivante**.

### Outils à risque d'injection directe (priorité critique)

1. **`http_request`** (`agentToolsExternal.ts:66`): L'agent peut requêter n'importe quelle URL. Le body HTTP brut est retourné dans `result.data`. Une page malveillante peut contenir du texte structuré comme des appels d'outils.
2. **`readUrl`** (`agentTools.ts:244`): Récupère jusqu'à 3000 chars de contenu web. Pas de délimitation.
3. **`jina_read_url`/`jina_read_reddit`/`jina_read_twitter`**: Contenu via Jina Reader API. Même problème.
4. **`reddit_get_posts`/`reddit_search`**: Le contenu des posts Reddit est retourné brut.
5. **`twitter_search`/`twitter_get_user`**: Le texte des tweets est retourné brut.
6. **`rss_monitor`**: Les articles RSS peuvent contenir du HTML/texte arbitraire.
7. **`transcribeAudio`**: Transcription audio — un message vocal pourrait contenir des instructions.
8. **`youtube_transcript`**: Transcription YouTube — même vecteur.
9. **`scrape_urban_slang`/`scrape_steamrep_status`**: Scraping HTML → texte potentiellement contrôlé par attaquant.
10. **`website_diff`**: Diff de page web — contenu externe.

### Mesures de mitigation actuelles

- **Aucune**. Aucun balisage de délimitation, aucune détection heuristique, aucune séparation entre contenu fiable et non fiable.
- Le SOAR gate (`agentSoarGate.ts`) bloque les outils restreints en canal public, mais **ne prévient pas l'injection en DM** où tous les outils sont disponibles.

---

## 3. Doublons fonctionnels

### Doublons confirmés (tools faisant la même chose dans des modules différents)

| Concept | Tool A (Module) | Tool B (Module) | Garder | Raison |
|---|---|---|---|---|
| Météo actuelle | `getWeather` (Core) | `get_weather_forecast` (Extra) | Les deux | Légitime: current vs 5-day forecast |
| Météo | `getWeather` (Core) | — | `getWeather` | — |
| Prix crypto | `getCryptoPrice` (Core) | `get_crypto_top` (Extra) | Les deux | Légitime: prix unitaire vs top 10 |
| Prix action | `getStockPrice` (Extended) | `get_stock_price` (Free) | `getStockPrice` (Extended) | Extended utilise Stooq (gratuit, pas de clé), Free utilise Alpha Vantage (clé requise). Extended est plus fiable. |
| Info pays | `getCountryInfo` (Extended) | `get_country_info` (Free) | `getCountryInfo` (Extended) | Extended est plus complet (monnaie, langues), Free est un sous-ensemble. |
| Taux de change | `getCurrencyRate` (Extended) | `get_currency_rate` (Free) | `getCurrencyRate` (Extended) | Même API (exchangerate.host), Extended a conversion de montant. |
| Image chat | `getCatImage` (Extended) | `get_cat_image` (Free) | `getCatImage` (Extended) | Extended utilise Cataas, Free utilise Cataas aussi. Doublon exact. |
| Info Pokémon | `getPokemon` (Extended) | `get_pokemon` (Free) | `getPokemon` (Extended) | Même API (PokeAPI), Extended est plus complet. |
| Package NPM | `getNpmPackage` (Extended) | `get_npm_package` (Free) | `getNpmPackage` (Extended) | Extended a téléchargements en plus. |
| Package PyPI | `getPypiPackage` (Extended) | `get_pypi_package` (Free) | `getPypiPackage` (Extended) | Extended est plus complet. |
| NASA APOD | `getNasaApod` (Extended) | `get_nasa_apod` (Free) | `get_nasa_apod` (Free) | Free utilise env var, Extended utilise DEMO_KEY. Free est plus correct. |
| Urban Dictionary | `getUrbanDict` (Extended) | `get_urban_dict` (Free) | `getUrbanDict` (Extended) | Même API. Extended est plus ancien mais fonctionnel. |
| Random user | `getRandomUser` (Extended) | `get_random_user` (Free) | `getRandomUser` (Extended) | Doublon exact. |
| GitHub profile | `getGithubUser` (Extended) | `github_profile` (Autonomous) | `github_profile` (Autonomous) | Autonomous est plus complet (repos, gists, contribution graph). |
| GitHub repo | `getGitHubRepo` (Core) | `get_github_repo_info` (Autonomous, si présent) | `getGitHubRepo` (Core) | Core est plus simple et direct. |
| Reddit posts | `getRedditPosts` (Extended) | `reddit_get_posts` (Autonomous) | `reddit_get_posts` (Autonomous) | Autonomous supporte sort (hot/new/top), Extended est plus basique. |
| Hacker News | `getTechNews` (Core) | `get_hackernews_top` (Extra) | `get_hackernews_top` (Extra) | Extra utilise Firebase API (plus précis), Core utilise scraping. |
| Wikipedia | `getWikipediaSummary` (Core) | `search_wikipedia` (Extra) | Les deux | Légitime: summary single vs search multi-résultats. |
| Detect language | `detect_language` (Autonomous) | — | — | Pas de doublon confirmé dans d'autres modules. |
| Urban slang | `scrape_urban_slang` (Autonomous) | `getUrbanDict` (Extended) / `get_urban_dict` (Free) | `getUrbanDict` (Extended) | Autonomous scrape manuellement, les autres utilisent l'API. Garder l'API. |

### Résumé des doublons à fusionner

- **12 paires de doublons exacts ou quasi-exacts** identifiés
- **Estimation de réduction**: -12 tools → ~217 tools (avant autres optimisations)
- **Cible 160-180**: nécessite également le regroupement par intention (Phase 2.2) et le tool retrieval (Phase 2.3)

---

## 4. Schéma Prisma — Modèles se chevauchant

### 4a. Modération: `Warning` / `WarningLog` / `Sanction` / `ModAction`

| Modèle | Ligne | Rôle | Légitime? |
|---|---|---|---|
| `Warning` | `schema.prisma:317` | État courant des avertissements d'un utilisateur (count, actif/inactif) | **Oui** — état courant |
| `WarningLog` | `schema.prisma:192` | Log append-only de chaque avertissement (qui, quand, raison) | **Oui** — audit trail |
| `Sanction` | `schema.prisma:299` | Sanctions formelles (TIMEOUT, KICK, BAN) avec moderatorId | **Oui** — type différent |
| `ModAction` | `schema.prisma:178` | Actions de modération génériques (type, moderatorId, targetId) | **Dette** — chevauche `Sanction` |

**Recommandation**: `ModAction` est un parent générique de `Sanction`. Fusionner `ModAction` dans `Sanction` en ajoutant les types manquants, ou documenter la distinction (ModAction = actions non punitives comme "note", "observe").

### 4b. Mémoire: `MemoryFact` / `MemoryEmbedding` / `MemoryLink` / `MemoryMessage` / `MemoryDecayLog`

| Modèle | Ligne | Rôle | Légitime? |
|---|---|---|---|
| `MemoryFact` | `schema.prisma:1015` | Faits stockés (key, value, category, weight) | **Oui** — stockage principal |
| `MemoryEmbedding` | `schema.prisma:1050` | Embeddings vectoriels pour RAG | **Oui** — index vectoriel |
| `MemoryLink` | `schema.prisma:1250` | Graphe de liens entre faits (sourceKey, targetKey, relation) | **Oui** — graphe de connaissances |
| `MemoryMessage` | `schema.prisma:1036` | Messages conversationnels stockés par utilisateur | **Oui** — historique de chat |
| `MemoryDecayLog` | `schema.prisma:1063` | Log de decay (oubli temporel) | **Oui** — append-only log |

**Recommandation**: Tous légitimes. Ajouter documentation en tête de `schema.prisma` expliquant l'architecture mémoire.

### 4c. Profil utilisateur: `UserProfile` / `MemberProfile` / `UserPreference`

| Modèle | Ligne | Rôle | Légitime? |
|---|---|---|---|
| `UserProfile` | `schema.prisma:950` | Préférences globales (userId unique, preferences string) | **Dette** — `preferences` est un blob JSON non structuré |
| `MemberProfile` | `schema.prisma:1174` | Profil par serveur (bio, color, per-guild) | **Oui** — spécifique au serveur |
| `UserPreference` | `schema.prisma:266` | Préférences structurées (wishlistDm bool) | **Oui** — config booléenne |

**Recommandation**: `UserProfile` est redondant avec `UserPreference` + `MemberProfile`. Fusionner `UserProfile.preferences` dans `UserPreference` en ajoutant des colonnes structurées.

### 4d. Logs: `Log` / `CommandLog` / `UserActivityLog`

| Modèle | Ligne | Rôle | Légitime? |
|---|---|---|---|
| `Log` | `schema.prisma:151` | Log générique (type, action, userId, details) | **Oui** — log système |
| `CommandLog` | `schema.prisma:166` | Log des slash commands (commandName, args) | **Oui** — spécifique aux commands |
| `UserActivityLog` | `schema.prisma:204` | Activité utilisateur (action, metadata) | **Dette** — chevauche `Log` |

**Recommandation**: `UserActivityLog` pourrait être un type de `Log`. Fusionner si pas d'usage spécifique.

### 4e. Index manquants potentiels

À vérifier: colonnes utilisées dans les crons fréquents (60s, 30min) sans `@@index`:
- `Log.createdAt` — a un index (`@@index([createdAt(sort: Desc)])`)
- `CommandLog.userId` — a un index
- `Sanction.userId` — **pas d'index** sur `userId` seul (uniquement sur `type`)
- `WarningLog.guildId` — **pas d'index** sur `guildId`
- `MemoryFact.userId` — vérifier si indexé

---

## 5. Coût/latence du routage agent

### Estimation du coût tokens

**`ALL_AGENT_TOOLS`** (`agentTools.ts:538`): concatène 7 modules:
- `AGENT_TOOLS` (Core): ~24 tools
- `EXTENDED_TOOLS`: ~30 tools
- `AUTONOMOUS_TOOLS`: ~55 tools
- `FREE_TOOLS`: ~25 tools
- `EXTERNAL_TOOLS`: ~12 tools
- `EXTRA_TOOLS`: ~25 tools
- `KALI_TOOLS`: 2 tools
- **Total: ~173 tools** (pas 229 — l'inventaire initial surestime)

Chaque tool definition JSON Schema fait ~150-300 tokens (name + description + parameters).

**Estimation**:
- 173 tools × ~200 tokens/tool = **~34 600 tokens** juste pour lister les outils
- À ~$0.003/1K tokens (GPT-4o-mini) = ~$0.10/appel
- À ~$0.015/1K tokens (GPT-4o) = ~$0.52/appel

**`routeTools()`** (`agentToolRouter.ts:556`): filtre par mots-clés mais **retourne toujours `filterAvailableTools(allTools)`** — c'est-à-dire TOUS les tools disponibles, pas seulement les pertinents. Le filtrage par mot-clé (`relevantToolNames`) est calculé mais **jamais utilisé** pour réduire la liste envoyée au LLM.

```typescript
// agentToolRouter.ts:580
const filtered = filterAvailableTools(allTools);
// ↑ retourne TOUS les tools, pas seulement relevantToolNames
return applyContextGuard(filtered, isPublic);
```

**Ceci est un bug/gaspillage majeur**: le routage contextuel existe mais n'est pas appliqué. Tous les ~173 tools sont envoyés à chaque appel LLM.

### Taux d'erreur de sélection d'outil

Non mesurable directement sans accès aux logs de production. Les fichiers `aiLogAnalyzer.ts` et `promptScoring.ts` existent mais n'ont pas été inspectés pour cette audit. Recommandation: ajouter une métrique Prometheus `agent_tool_selection_error_total` pour quantifier.

---

## Annexes

### A. Secret en dur détecté

**`deploy_now.sh:13`**: Mot de passe SSH root en clair (`sshpass -p 'Si62u1j55exIO8'`).
- **Risque**: Compromission totale du VPS si le repo est leaké.
- **Recommandation**: Utiliser SSH key-based auth, ou variable d'environnement `SSH_PASS` référencée via `${SSH_PASS}`.

### B. Écart avec l'inventaire initial

- **229 outils annoncés vs ~173 réels**: L'inventaire initial surestime le nombre d'outils. Les 7 modules contiennent environ 173 tool definitions, pas 229.
- **97 modèles Prisma confirmés** dans `schema.prisma`.
