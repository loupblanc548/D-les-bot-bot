# AGENT_TOOLS_DEDUP.md

Analyse de déduplication des outils agent (7 fichiers, ~12 850 lignes).
Date: 2025-07-19
Statut: **Analyse — en attente de validation utilisateur avant toute suppression.**

---

## Inventaire par fichier

| Fichier | Lignes | Outils |
|---------|--------|--------|
| `agentTools.ts` | ~550 | 25 |
| `agentToolsAutonomous.ts` | ~3300 | 60 |
| `agentToolsExtended.ts` | ~3700 | 75 |
| `agentToolsExtra.ts` | ~450 | 25 |
| `agentToolsFree.ts` | ~400 | 25 |
| `agentToolsExternal.ts` | ~300 | 12 |
| `agentToolsKali.ts` | ~400 | 9 (+ 6 faux tools emoji) |
| **Total** | **~12 850** | **~231** |

---

## Doublons exacts (même fonction, noms différents)

### 1. Images d'animaux (chat/chien)

| Outil | Fichier | API |
|-------|---------|-----|
| `getCatImage` | `agentToolsExtended.ts` | Cataas |
| `get_cat_image` | `agentToolsFree.ts` | Cataas |
| `getDogImage` | `agentToolsExtended.ts` | Dog API |
| — | — | (pas de doublon chien) |

**Action**: Fusionner `get_cat_image` → `getCatImage`. Supprimer le handler dans `agentToolsFree.ts`.

### 2. NASA APOD

| Outil | Fichier | API |
|-------|---------|-----|
| `getNasaApod` | `agentToolsExtended.ts` | NASA demo key |
| `get_nasa_apod` | `agentToolsFree.ts` | NASA demo key |

**Action**: Fusionner `get_nasa_apod` → `getNasaApod`. Supprimer dans `agentToolsFree.ts`.

### 3. Pokémon

| Outil | Fichier | API |
|-------|---------|-----|
| `getPokemon` | `agentToolsExtended.ts` | PokéAPI |
| `get_pokemon` | `agentToolsFree.ts` | PokéAPI |

**Action**: Fusionner `get_pokemon` → `getPokemon`. Supprimer dans `agentToolsFree.ts`.

### 4. NPM Package

| Outil | Fichier | API |
|-------|---------|-----|
| `getNpmPackage` | `agentToolsExtended.ts` | npm registry |
| `get_npm_package` | `agentToolsFree.ts` | npm registry |

**Action**: Fusionner `get_npm_package` → `getNpmPackage`. Supprimer dans `agentToolsFree.ts`.

### 5. PyPI Package

| Outil | Fichier | API |
|-------|---------|-----|
| `getPypiPackage` | `agentToolsExtended.ts` | PyPI registry |
| `get_pypi_package` | `agentToolsFree.ts` | PyPI registry |

**Action**: Fusionner `get_pypi_package` → `getPypiPackage`. Supprimer dans `agentToolsFree.ts`.

### 6. Country Info

| Outil | Fichier | API |
|-------|---------|-----|
| `getCountryInfo` | `agentToolsExtended.ts` | REST Countries |
| `get_country_info` | `agentToolsFree.ts` | REST Countries |

**Action**: Fusionner `get_country_info` → `getCountryInfo`. Supprimer dans `agentToolsFree.ts`.

### 7. Currency Rate

| Outil | Fichier | API |
|-------|---------|-----|
| `getCurrencyRate` | `agentToolsExtended.ts` | exchangerate.host |
| `get_currency_rate` | `agentToolsFree.ts` | exchangerate.host |

**Action**: Fusionner `get_currency_rate` → `getCurrencyRate`. Supprimer dans `agentToolsFree.ts`.

### 8. Stock Price

| Outil | Fichier | API |
|-------|---------|-----|
| `getStockPrice` | `agentToolsExtended.ts` | Stooq |
| `get_stock_price` | `agentToolsFree.ts` | Stooq |

**Action**: Fusionner `get_stock_price` → `getStockPrice`. Supprimer dans `agentToolsFree.ts`.

### 9. Random User

| Outil | Fichier | API |
|-------|---------|-----|
| `getRandomUser` | `agentToolsExtended.ts` | RandomUser API |
| `get_random_user` | `agentToolsFree.ts` | RandomUser API |

**Action**: Fusionner `get_random_user` → `getRandomUser`. Supprimer dans `agentToolsFree.ts`.

### 10. Urban Dictionary

| Outil | Fichier | API |
|-------|---------|-----|
| `getUrbanDict` | `agentToolsExtended.ts` | Urban Dictionary |
| `get_urban_dict` | `agentToolsFree.ts` | Urban Dictionary |

**Action**: Fusionner `get_urban_dict` → `getUrbanDict`. Supprimer dans `agentToolsFree.ts`.

### 11. Reddit Posts

| Outil | Fichier | API |
|-------|---------|-----|
| `getRedditPosts` | `agentToolsExtended.ts` | Reddit JSON |
| `reddit_get_posts` | `agentToolsAutonomous.ts` | Reddit JSON |

**Action**: Fusionner `reddit_get_posts` → `getRedditPosts`. Supprimer dans `agentToolsAutonomous.ts`.

### 12. Détection de langue

| Outil | Fichier | Méthode |
|-------|---------|---------|
| `detect_language` | `agentToolsAutonomous.ts` | Heuristique |
| `detect_language` | `agentToolsExtended.ts` | Heuristique |

**Action**: Garder une seule implémentation (dans `agentToolsExtended.ts` car plus complet). Supprimer dans `agentToolsAutonomous.ts`.

### 13. Garbage Collection

| Outil | Fichier |
|-------|---------|
| `enforce_garbage_collection` | `agentToolsAutonomous.ts` |
| `triggerGarbageCollection` | `agentToolsExtended.ts` |

**Action**: Fusionner `enforce_garbage_collection` → `triggerGarbageCollection`. Supprimer dans `agentToolsAutonomous.ts`.

### 14. Joke

| Outil | Fichier | API |
|-------|---------|-----|
| `getJoke` | `agentToolsExtended.ts` | JokeAPI |
| — | — | (pas de doublon dans Free) |

### 15. Wikipedia

| Outil | Fichier | API |
|-------|---------|-----|
| `getWikipediaSummary` | `agentTools.ts` | Wikipedia FR |
| `search_wikipedia` | `agentToolsExtra.ts` | Wikipedia FR |

**Action**: Fusionner `search_wikipedia` → `getWikipediaSummary`. Supprimer dans `agentToolsExtra.ts`.

### 16. Weather

| Outil | Fichier | API |
|-------|---------|-----|
| `getWeather` | `agentTools.ts` | Open-Meteo (current) |
| `get_weather_forecast` | `agentToolsExtra.ts` | Open-Meteo (5-day) |

**Action**: **Conserver les deux** — un pour la météo actuelle, l'autre pour les prévisions 5 jours. Fonctionnellement distinct.

### 17. Crypto

| Outil | Fichier | API |
|-------|---------|-----|
| `getCryptoPrice` | `agentTools.ts` | CoinGecko (single) |
| `get_crypto_top` | `agentToolsExtra.ts` | CoinGecko (top 10) |
| `getCryptoInfo` | `agentToolsExtended.ts` | CoinGecko (detailed) |

**Action**: Fusionner `getCryptoPrice` + `getCryptoInfo` → un seul outil `getCryptoInfo` avec paramètre optionnel. Conserver `get_crypto_top` (fonctionnellement distinct — liste top 10).

### 18. GitHub

| Outil | Fichier | API |
|-------|---------|-----|
| `getGitHubRepo` | `agentTools.ts` | GitHub API (repo) |
| `getGithubUser` | `agentToolsExtended.ts` | GitHub API (user) |
| `getGithubRepoInfo` | `agentToolsExtended.ts` | GitHub API (repo) |
| `github_profile` | `agentToolsAutonomous.ts` | GitHub API (user) |
| `get_github_trending` | `agentToolsExtra.ts` | GitHub trending |
| `get_github_gists` | `agentToolsExtra.ts` | GitHub gists |

**Action**: 
- Fusionner `getGitHubRepo` + `getGithubRepoInfo` → `getGithubRepoInfo` (même chose)
- Fusionner `getGithubUser` + `github_profile` → `getGithubUser`
- Conserver `get_github_trending` et `get_github_gists` (distinct)

### 19. Translate

| Outil | Fichier | API |
|-------|---------|-----|
| `translateText` | `agentTools.ts` | MyMemory (gratuit) |
| `translateTextDeepL` | `agentToolsExtended.ts` | DeepL (clé requise) |

**Action**: **Conserver les deux** — MyMemory gratuit sans clé, DeepL meilleure qualité avec clé. L'agent choisit selon le contexte.

### 20. Tech News / Hacker News

| Outil | Fichier | API |
|-------|---------|-----|
| `getTechNews` | `agentTools.ts` | Hacker News |
| `get_hackernews_top` | `agentToolsExtra.ts` | Hacker News |

**Action**: Fusionner `getTechNews` → `get_hackernews_top` (plus complet dans Extra). Supprimer dans `agentTools.ts`.

### 21. IP Info

| Outil | Fichier | API |
|-------|---------|-----|
| `getIpInfo` | `agentToolsExtended.ts` | ipapi.co |
| `ip_geolocation` | `agentToolsAutonomous.ts` | ipapi.co |

**Action**: Fusionner `ip_geolocation` → `getIpInfo`. Supprimer dans `agentToolsAutonomous.ts`.

### 22. DNS Lookup

| Outil | Fichier | API |
|-------|---------|-----|
| `dnsLookup` | `agentToolsExtended.ts` | dns.google |
| (dans `osint.ts` command) | — | — |

**Action**: Pas de doublon dans les tools agent. Conserver.

### 23. Password / UUID / Hash

| Outil | Fichier |
|-------|---------|
| `generatePassword` | `agentToolsExtended.ts` |
| `generate_hash` | `agentToolsExtra.ts` |
| `generate_uuid` | `agentToolsExtra.ts` |
| `base64_encode_decode` | `agentToolsExtra.ts` |

**Action**: Pas de doublon. Conserver tous.

---

## Quasi-doublons (même intention, implémentation différente)

### 24. Recherche web

| Outil | Fichier | API |
|-------|---------|-----|
| `searchWeb` | `agentTools.ts` | DuckDuckGo |
| `exa_web_search` | `agentToolsAutonomous.ts` | Exa AI |
| `search_wikipedia` | `agentToolsExtra.ts` | Wikipedia |

**Action**: Conserver `searchWeb` (DuckDuckGo, gratuit, pas de clé). `exa_web_search` nécessite une clé Exa — conserver si configuré, sinon marquer comme optionnel. Wikipedia déjà fusionné ci-dessus.

### 25. Lecture URL

| Outil | Fichier | API |
|-------|---------|-----|
| `readUrl` | `agentTools.ts` | fetch + texte |
| `jina_read_url` | `agentToolsAutonomous.ts` | Jina Reader API |
| `open_web_page` | `agentToolsAutonomous.ts` | Puppeteer? |

**Action**: Fusionner `readUrl` + `jina_read_url` → `jina_read_url` (meilleure extraction). Conserver `open_web_page` si il fait du rendu JS (distinct).

### 26. Modération (timeout/warn/ban/kick)

| Outil | Fichier |
|-------|---------|
| `timeoutUser` | `agentTools.ts` |
| `warnUser` | `agentTools.ts` |
| `banUser` | `agentToolsExtended.ts` |
| `kickUser` | `agentToolsExtended.ts` |

**Action**: Pas de doublon. Conserver tous — actions distinctes.

### 27. Memory

| Outil | Fichier |
|-------|---------|
| `searchUserMemory` | `agentTools.ts` |
| `saveMemoryFact` | `agentTools.ts` |
| `upsert_user_memory` | `agentToolsAutonomous.ts` |
| `retrieve_user_memory` | `agentToolsAutonomous.ts` |

**Action**: Fusionner `searchUserMemory` + `retrieve_user_memory` → `retrieve_user_memory`. Fusionner `saveMemoryFact` + `upsert_user_memory` → `upsert_user_memory`. Supprimer les versions dans `agentTools.ts`.

### 28. Steam

| Outil | Fichier |
|-------|---------|
| `getSteamGame` | `agentToolsExtended.ts` |
| `getSteamDeals` | `agentToolsExtended.ts` |
| `getGameNews` | `agentToolsExtended.ts` |
| `getSteamPlayerCount` | `agentToolsExtended.ts` |
| `get_steam_requirements` | `agentToolsExtra.ts` |

**Action**: Pas de doublon. Conserver tous.

### 29. Faux tools dans `agentToolsKali.ts`

6 "tools" avec noms emoji (`🎯 Cible Exacte`, `🐳 Environnement`, etc.) ne sont pas des function tools valides — ce sont des champs de prompt, pas des outils.

**Action**: Retirer ces 6 entrées de la liste d'outils. Les garder comme template de prompt si nécessaire.

---

## Résumé des fusions proposées

| # | Outil supprimé | Outil conservé | Fichier source |
|---|----------------|----------------|----------------|
| 1 | `get_cat_image` | `getCatImage` | Free → Extended |
| 2 | `get_nasa_apod` | `getNasaApod` | Free → Extended |
| 3 | `get_pokemon` | `getPokemon` | Free → Extended |
| 4 | `get_npm_package` | `getNpmPackage` | Free → Extended |
| 5 | `get_pypi_package` | `getPypiPackage` | Free → Extended |
| 6 | `get_country_info` | `getCountryInfo` | Free → Extended |
| 7 | `get_currency_rate` | `getCurrencyRate` | Free → Extended |
| 8 | `get_stock_price` | `getStockPrice` | Free → Extended |
| 9 | `get_random_user` | `getRandomUser` | Free → Extended |
| 10 | `get_urban_dict` | `getUrbanDict` | Free → Extended |
| 11 | `reddit_get_posts` | `getRedditPosts` | Autonomous → Extended |
| 12 | `detect_language` (Autonomous) | `detect_language` (Extended) | Autonomous → Extended |
| 13 | `enforce_garbage_collection` | `triggerGarbageCollection` | Autonomous → Extended |
| 14 | `search_wikipedia` | `getWikipediaSummary` | Extra → Tools |
| 15 | `getCryptoPrice` | `getCryptoInfo` | Tools → Extended |
| 16 | `getGitHubRepo` | `getGithubRepoInfo` | Tools → Extended |
| 17 | `github_profile` | `getGithubUser` | Autonomous → Extended |
| 18 | `getTechNews` | `get_hackernews_top` | Tools → Extra |
| 19 | `ip_geolocation` | `getIpInfo` | Autonomous → Extended |
| 20 | `readUrl` | `jina_read_url` | Tools → Autonomous |
| 21 | `searchUserMemory` | `retrieve_user_memory` | Tools → Autonomous |
| 22 | `saveMemoryFact` | `upsert_user_memory` | Tools → Autonomous |
| 23 | 6 faux tools emoji | — | Kali (retirer) |

**Total**: 23 fusions/suppressions → **~231 outils → ~208 outils**

---

## Objectif 160-180 outils

Pour atteindre 160-180 outils, il faudrait en plus:

1. **Évaluer les outils OpenRouter** (`or_*` — 7 outils): `or_benchmarks`, `or_chat_test`, `or_credits`, `or_docs_search`, `or_list_models`, `or_model_info`, `or_rankings`. Ce sont des outils de debug/meta, pas utiles en production. **Supprimer les 7**.

2. **Évaluer les outils de modération Discord** dans Extended (`addRole`, `removeRole`, `banUser`, `kickUser`, `createChannel`, `deleteChannel`, `lockChannel`, `unlockChannel`, `setChannelTopic`, `setNickname`, `createInvite`, `sendDM`, `getMemberInfo`, `getServerRoles`, `getVoiceChannels`, `getEmojis`, `getAuditLog`): 17 outils. Certains sont redondants avec les commandes slash existantes. **Évaluer l'usage réel** — si l'agent ne les appelle jamais, supprimer.

3. **Outils de build embed** dans Autonomous (`build_progress_embed`, `build_rich_embed`, `build_stat_cards_embed`, `build_timeline_embed`): 4 outils qui sont des helpers de formatage, pas des function tools au sens LLM. **Retirer de la liste d'outils**, garder comme fonctions internes.

4. **Outils redondants avec les commandes**: `get_server_insights`, `guild_analytics`, `moderation_stats`, `top_commands`, `message_trend` — 5 outils analytics qui se chevauchent. **Fusionner en 1-2 outils**.

**Total supplémentaire**: ~7 + 4 + 3 = ~14 suppresspressions supplémentaires → **~208 → ~194 outils**

Pour descendre à 160-180, il faudrait évaluer l'usage réel de chaque outil restant via `commandAnalytics.ts` et supprimer les outils jamais appelés.

---

## Validation requise

**Aucune suppression ne sera exécutée tant que l'utilisateur n'a pas validé ce document.**
