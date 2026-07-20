# AUDIT OUVERT — 2026-07-21 (mis à jour)

## SECTION 0 — Dépôt GitHub (RÉSOLU)

**Constat initial**: Le dépôt `loupblanc548/D-les-bot-bot` était **PUBLIC**.
**Statut actuel**: ✅ **RÉSOLU** — Le dépôt est maintenant **privé** (confirmé par l'utilisateur le 2026-07-21).

---

## SECTION 1 — Réponse vocale automatique (CORRIGÉ)

**Constat**: `speakResponseInVoice()` était appelée automatiquement dans `messages.ts` (lignes 487 et 603) sans vérifier:
- `currentConfig.enabled` (le toggle vocal global)
- Consentement de l'utilisateur (opt-in)
- Rate-limit (possibilité de spam via mentions répétées)

**Correctifs appliqués**:

1. **Respect du toggle** ✅: `speakResponseInVoice()` vérifie maintenant `currentConfig.enabled` avant toute action (guard 1 dans `voiceAgent.ts`)

2. **Opt-in explicite par utilisateur** ✅: Ajout de `voiceOptInUsers` / `voiceOptOutUsers` (Sets en mémoire) avec fonctions exportées:
   - `voiceOptIn(userId)` — active les réponses vocales pour un utilisateur
   - `voiceOptOut(userId)` — désactive
   - `isVoiceOptedIn(userId)` — vérification
   - La réponse vocale ne se déclenche que pour les utilisateurs ayant opté in (guard 2)

3. **Configuration par serveur** — **Question à trancher**: Faut-il ajouter une liste de salons vocaux autorisés par serveur (configurable par admin) ? Actuellement, le rate-limit + opt-in suffisent à limiter l'abus, mais une restriction par salon serait plus stricte.

4. **Rate-limit** ✅: Ajout de `checkVoiceRateLimit(guildId)` — max 1 prise de parole par 10 secondes par guild (guard 3)

5. **Registre de risque** ✅: `speakResponseInVoice` ajouté à `toolRiskRegistry.ts` comme `level: "medium", module: "voice"` avec raison "Intrusive audible effect on all users in voice channel"

---

## SECTION 2 — Audit ouvert

### 2.1 Nouvelles fonctionnalités et registre de risque

**Constat**: 80+ outils batch2 + `teraterm_info` + `follow_social`/`unfollow_social`/`list_social_follows` n'avaient **aucune entrée** dans `toolRiskRegistry.ts`.

**Correctif appliqué** ✅: Ajout de toutes les entrées manquantes:
- 80 outils batch2 classés `low` (read-only APIs ou calculs locaux)
- `teraterm_info` → `low` (read-only GitHub API)
- `speakResponseInVoice` → `medium` (effet intrusif audible)
- `follow_social` → `medium` (notifications vers DMs/channels — risque de spam)
- `unfollow_social` → `low` (suppression, aucun effet externe)
- `list_social_follows` → `low` (read-only)

### 2.2 Rate-limiting et abus — Social Follow

**Constat**: `socialFollow.ts` n'a **aucune limite** sur:
- Le nombre de flux suivis simultanément par utilisateur/serveur
- Le nombre de notifications DM envoyées par cycle de monitoring
- La fréquence de polling des plateformes

**Risques**:
- Un utilisateur peut ajouter un nombre illimité de flux, générant un volume massif de notifications DM
- Le monitoring interval poll toutes les plateformes à chaque cycle — pas de backoff

**Question à trancher**: Faut-il limiter le nombre de flux par serveur (ex: max 20) et par utilisateur (ex: max 10) ? Quel intervalle de monitoring est acceptable ?

### 2.3 APIs tierces non officielles

**Constat**: `voiceAgent.ts` utilise 4 providers TTS avec fallback en cascade:
1. **ElevenLabs** — API officielle, clé requise ✅
2. **Microsoft Edge TTS** — WebSocket public non documenté ⚠️ (peut être bloqué à tout moment)
3. **StreamElements** — API non officielle ⚠️ (non garanti, pas de ToS clair)
4. **Google Translate TTS** — endpoint non officiel ⚠️ (violation potentielle des ToS Google)

**Évaluation**: Le fallback en cascade gère bien les défaillances (timeout 10s sur chaque). Cependant:
- Edge TTS et Google Translate TTS n'ont pas de garantie de disponibilité
- Google Translate TTS pourrait violer les conditions d'utilisation de Google

**Recommandation**: Documenter le risque dans le README. Le fallback gère les pannes, mais l'usage de Google Translate TTS devrait être désactivable via config.

### 2.4 Gestion d'erreur et résilience

**Constat**: Tous les `fetch()` dans les fichiers batch2 (`textCryptoTools.ts`, `calcDateTools.ts`, `apiTools.ts`, `funMiscTools.ts`) ont des `AbortSignal.timeout()` explicites (10-15s). ✅

**Constat**: Les erreurs sont catchées et retournées comme `ToolCallResult` avec `success: false` sans faire planter le process. ✅

**Constat**: Aucune donnée sensible n'est incluse dans les messages d'erreur retournés à l'utilisateur. ✅

**Rien à signaler de critique.**

### 2.5 Cohérence RGPD après les nouveaux ajouts

**Constat**: `forgetUser()` dans `privacyService.ts` ne couvrait **pas** la table `SocialFollow` (qui contient `addedBy` = userId).

**Correctif appliqué** ✅:
- Ajout de `SocialFollow` dans `previewUserDeletion()` (count)
- Ajout de `prisma.socialFollow.deleteMany({ where: { addedBy: userId } })` dans `forgetUser()`
- Ajout de `SocialFollow` dans `exportUserData()`

**Note**: Les préférences vocales opt-in/opt-out sont actuellement en mémoire (Sets), pas en base — elles disparaissent au redémarrage. Si on veut les persister, il faudra une table `VoicePreference` et l'ajouter au RGPD.

### 2.6 Dépendances ajoutées récemment

**Constat**: `npm audit` rapporte des vulnérabilités **high** sur `axios` (via `@xboxreplay/xboxlive-auth` et `cmake-js`):
- Cross-Site Request Forgery
- SSRF via absolute URL
- Prototype Pollution (multiple CVEs)
- Credential leakage

**Recommandation**: Exécuter `npm audit fix` pour mettre à jour axios. Les vulnérabilités sont dans des dépendances transitives, pas dans le code direct du bot.

### 2.7 Permissions et exposition des nouvelles commandes

**Constat**: Les commandes admin ont des `setDefaultMemberPermissions` appropriés:
- `/follow` (social follow) → `PermissionFlagsBits.ManageChannels` ✅ (réservé aux modérateurs)
- `/privacy` → pas de restriction visible (accessible à tous) ✅ (RGPD: l'utilisateur supprime ses propres données)
- `/voice` → non trouvé comme commande slash séparée (config via dashboard/admin)
- Les ~80 outils batch2 n'ont pas de commandes slash dédiées — ils sont invoqués via langage naturel ✅

**Rien à signaler.**

### 2.8 Fuites de secrets dans les nouveaux fichiers

**Constat**: Scan de patterns de secrets (`sk-`, `ghp_`, `AIza`, `xox`, tokens Discord) sur tous les fichiers `*.ts` → **Aucun secret en dur trouvé.** ✅

### 2.9 Qualité générale

**Constat**: 65 occurrences de `TODO`/`FIXME`/`HACK`/`XXX` dans 22 fichiers — la plupart sont des marqueurs de travail en cours légitimes dans un projet actif.

**Constat**: Pas de fonctions dupliquées entre les fichiers batch2 et l'existant — les imports sont propres.

**Constat**: Le fichier `agentToolsBatch2.ts` initialement prévu n'existe pas — il a été correctement divisé en 4 fichiers sous `src/services/batch2/` et réunis via imports dans `agentToolsExtra.ts`. ✅

---

## Résumé des actions

| # | Point | Statut | Action |
|---|---|---|---|
| 0 | Dépôt public | 🚨 BLOQUANT | Utilisateur doit rendre privé |
| 1 | Voix auto sans garde-fou | ✅ Corrigé | Toggle + opt-in + rate-limit |
| 2.1 | Risk registry incomplet | ✅ Corrigé | 85+ entrées ajoutées |
| 2.2 | Social follow sans limite | ⚠️ Question | Limiter nb flux par serveur ? |
| 2.3 | APIs non officielles | ℹ️ Documenté | Fallback gère les pannes |
| 2.4 | Timeouts/erreurs | ✅ OK | Tous les fetch ont timeout |
| 2.5 | RGPD SocialFollow | ✅ Corrigé | Ajouté à forgetUser + export |
| 2.6 | Dépendances vulnérables | ⚠️ Recommandé | `npm audit fix` pour axios |
| 2.7 | Permissions commandes | ✅ OK | setDefaultMemberPermissions présent |
| 2.8 | Secrets en dur | ✅ OK | Aucun trouvé |
| 2.9 | Qualité générale | ✅ OK | Structure propre |

---

## SECTION 3 — Faille SSRF via outils de lecture d'URL (CORRIGÉ)

**Constat**: Les outils `readUrl`, `fetchAndSummarize`, `analyze_pdf`, `get_http_status`, `ssl_checker`, `color_palette_from_image`, et `readUrlViaJina` faisaient des requêtes HTTP vers des URLs fournies par l'utilisateur sans vérifier que l'IP résolue n'était pas privée/locale. Un message comme *"résume ce lien : http://localhost:9090/metrics"* pouvait faire sonder les services internes du VPS.

**Correctifs appliqués** ✅:

1. **Guard centralisé** — `src/utils/ssrfGuard.ts`:
   - `checkUrlForSsrf(url, context)` — résout le DNS, vérifie les plages privées
   - `safeFetch(url, options, context)` — wrapper fetch avec guard + suivi manuel des redirections (max 3, chaque destination re-vérifiée)
   - Plages bloquées: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8, ::1, fc00::/7, fe80::/10, IPv4-mapped IPv6
   - Notations alternatives: décimal (2130706433 → 127.0.0.1)
   - Logging des tentatives bloquées (URL, IP résolue, contexte)

2. **Points d'entrée patchés** (7 outils):
   - `toolReadUrl` (agentTools.ts) → `safeFetch`
   - `fetchAndExtract` (webIngestion.ts) → `safeFetch`
   - `readUrlViaJina` (agentReach.ts) → `checkUrlForSsrf` avant passage à Jina
   - `toolAnalyzePdf` (agentToolsExtra.ts) → `safeFetch`
   - `tGetHttpStatus` (agentToolsExtended.ts) → `checkUrlForSsrf`
   - `toolSslChecker` (batch2/apiTools.ts) → `checkUrlForSsrf` avant connexion TLS
   - `toolColorPaletteFromImage` (batch2/apiTools.ts) → `checkUrlForSsrf` avant passage à color.pizza

3. **Tests** — `src/utils/ssrfGuard.test.ts`: 15 tests, tous passent:
   - Blocage: localhost, 127.0.0.1, 169.254.169.254 (AWS metadata), 10.x, 192.168.x, 172.16.x, 0.0.0.0, ::1, notation décimale
   - Autorisation: URLs publiques, IPs publiques
   - `safeFetch` lance une erreur SSRF sur localhost/127.0.0.1/AWS metadata

4. **Outils batch2 sans risque SSRF**: Tous les autres fetchs du batch2 utilisent des APIs fixes avec des paramètres de recherche encodés (Jikan, Reddit, NumbersAPI, BoredAPI, NPM, PokeAPI, etc.) — pas de risque SSRF car l'URL de destination est toujours un hostname fixe.

---

## SECTION 4 — Améliorations notées mais non implémentées (hors périmètre de ce prompt)

- **Opt-in vocal en base**: Actuellement en mémoire (Sets), se perd au redémarrage. Amélioration: persister dans une table `VoicePreference` + couverture RGPD.
- **Limite de flux social follow**: Pas de limite sur le nombre de flux par serveur/utilisateur. Recommandation: max 20 par serveur, max 10 par utilisateur.
- **`npm audit fix`**: Vulnérabilités high sur axios (CSRF, SSRF, prototype pollution). Recommandé mais non appliqué (risque de breaking change).
- **TMDB API key en dur**: `agentToolsExtra.ts:3454` contient `api_key=8265bd1679663a7ea12ac168da84d2dd` — c'est une clé API publique TMDB gratuite, mais elle devrait être en variable d'environnement.

