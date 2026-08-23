# AUDIT_NLU.md — État des lieux du routage d'outils actuel

> Date: 2026-07-18
> Fichier audité: `src/services/agentToolRouter.ts` (799 lignes)

---

## 1. Architecture actuelle du routage

### 1.1 Mécanisme de sélection

Le routeur utilise **exclusivement des mots-clés en dur** (string matching `lowerMsg.includes(keyword)`) pour suggérer des outils. Aucun embedding, aucune similarité sémantique, aucun LLM n'intervient dans la sélection.

**Flux:**
1. `routeTools(userMessage, allTools, isPublic)` est appelé
2. `TOOL_CATEGORIES` (56 entrées) est parcouru: pour chaque catégorie, chaque keyword est testé via `includes()`
3. Les outils des catégories matchées sont ajoutés à un Set `relevantToolNames`
4. **Mais ce Set n'est jamais utilisé pour filtrer** — la fonction retourne `filterAvailableTools(allTools)` (tous les outils), pas seulement les pertinents
5. Le Set sert uniquement au log (`[ToolRouter] Tools suggérés pour...`)

**Conclusion critique**: Le routeur actuel **ne réduit pas le catalogue d'outils présenté au LLM**. Il suggère des hints dans le system prompt via `getToolHints()`, mais le LLM reçoit **l'intégralité des ~173 outils à chaque appel**.

### 1.2 Hints et chaînes

- `getToolHints()`: génère un texte "Pour 'météo', utilise: getWeather" injecté dans le system prompt
- `suggestToolChain()`: 16 chaînes hardcodées pour les scénarios multi-étapes (deals, analyse user, scam, etc.)

### 1.3 Context Guard

- `applyContextGuard()`: strip les outils de `RESTRICTED_TOOLS` (17 outils) en canal public
- Fonctionne correctement — c'est un filtre de sécurité, pas de pertinence

### 1.4 Filtrage par clé API

- `filterAvailableTools()`: désactive les outils dont les clés API obligatoires sont absentes
- 24 entrées dans `API_KEY_REGISTRY`

---

## 2. Échecs identifiés

### 2.1 Synonymes et reformulations non prévus

Le matching par `includes()` échoue sur:

| Formulation utilisateur | Mot-clé attendu | Match? | Outil correct |
|---|---|---|---|
| "fait froid aujourd'hui ?" | "météo", "température" | ❌ Non | `getWeather` |
| "ça vaut combien le bitcoin" | "crypto", "bitcoin", "prix" | ✅ Oui (bitcoin) | `getCryptoPrice` |
| "convertir 100 euros en dollars" | "convertir", "euro", "dollar" | ✅ Oui | `getCurrencyRate` |
| "dessine-moi un chat" | "dessine" | ✅ Oui | `generate_image` |
| "je m'ennuie" | "ennui", "ennuyé" | ✅ Oui | `getAdvice` |
| "c'est quoi la capitale du Japon" | "pays", "country", "capitale" | ✅ Oui | `getCountryInfo` |
| "tu peux chercher ça pour moi" | "chercher" | ✅ Oui | `searchWeb` |
| "fais-moi rire" | "drôle", "rigolo", "humour" | ❌ Non | `getJoke` |
| "elle est comment la météo" | "météo" | ✅ Oui | `getWeather` |
| "quel temps il fait" | "weather" (EN), "température" | ❌ Non (FR) | `getWeather` |
| "balance un truc marrant" | (aucun) | ❌ Non | `getJoke` |
| "ça parle de quoi sur reddit" | "reddit" (non dans catégories fun) | ❌ Non | `reddit_search` |

**Taux d'échec estimé sur reformulations naturelles: ~30-40%**

### 2.2 Ambiguïté entre outils plausibles

| Message | Outils matchés | Outil correct probable |
|---|---|---|
| "scan cette IP" | `osint_scan`, `verify_link_safety`, `domain_age` (catégorie OSINT) + `runKaliPortAudit` (catégorie network) | Dépend du contexte — **aucun scoring de confiance** |
| "analyse ce user" | `get_user_moderation_history`, `osint_scan`, `track_avatar_hash` (chaîne suggérée) | Dépend de l'intention |
| "cherche sur le web" | `searchWeb`, `getWikipediaSummary` (catégorie recherche) | `searchWeb` — mais Wikipedia est aussi proposé |

### 2.3 Argot et fautes de frappe

| Formulation | Attendu | Match? |
|---|---|---|
| "meteo" (sans accent) | "météo" | ❌ Non (includes est accent-sensitive) |
| "blague" → "balgue" (faute) | "blague" | ❌ Non |
| "c koi le prix du btc" | "prix", "btc" | ✅ Oui (btc) |
| "cherche" → "cherch" | "chercher" | ❌ Non |

### 2.4 Mélange FR/EN

| Formulation | Match? |
|---|---|
| "what's the weather like" | ✅ "weather" |
| "météo today" | ✅ "météo" |
| "prix du bitcoin please" | ✅ "prix" + "bitcoin" |
| "translate this to French" | ✅ "translate" |
| "wie ist das wetter" (DE) | ❌ Aucun mot-clé allemand |

### 2.5 Demandes implicites sans verbe d'action

| Formulation | Match? | Outil correct |
|---|---|---|
| "Paris" | ❌ Non | `getWeather` (météo Paris) ou `getCountryInfo` |
| "AAPL" | ✅ "aapl" (catégorie stock) | `getStockPrice` |
| "lol" | ❌ Non | `getJoke` ou rien |
| "42" | ❌ Non | `getTrivia` (nombre) ou `solveMath` |

### 2.6 Problème de volume (token cost)

Le routeur retourne **tous les outils filtrés** (~150-160 après context guard + clé API), pas seulement les pertinents. Avec ~173 outils × ~150 tokens par définition = **~26,000 tokens de définitions d'outils à chaque appel LLM**.

L'ajout des 7 nouveaux outils (Partie A) augmenterait ce coût à ~27,000 tokens — marginal mais dans la mauvaise direction.

---

## 3. Instrumentation de baseline

### 3.1 Mesure actuelle

- `aiLogAnalyzer.ts` et `promptScoring.ts` existent mais **ne mesurent pas le taux de succès de sélection d'outil**
- Les logs `routeTools` enregistrent les outils suggérés mais **pas si le LLM a utilisé le bon outil**
- Aucune métrique Prometheus sur la qualité du routage

### 3.2 Recommandation d'instrumentation

Ajouter une métrique `tool_routing_accuracy` dans `agentLoop.ts`:
- Après exécution, logger: outil demandé par le LLM vs outil suggéré par le routeur
- Si l'outil utilisé par le LLM est dans les suggestions du routeur → `hit`
- Sinon → `miss`
- Exposer via Prometheus: `agent_tool_routing_hits_total{tool}`, `agent_tool_routing_misses_total{tool}`

---

## 4. Synthèse des lacunes

| Lacune | Impact | Priorité |
|---|---|---|
| **Aucun filtrage réel** — tous les outils envoyés au LLM | Coût tokens + confusion LLM | **Critique** |
| Mots-clés en dur, pas de sémantique | 30-40% d'échec sur reformulations | **Critique** |
| Pas de scoring de confiance | Ambiguïté non gérée | **Haute** |
| Pas de normalisation (accents, fautes) | Échec sur variations orthographiques | **Haute** |
| Pas de mesure de qualité | Impossible d'évaluer les améliorations | **Moyenne** |
| Hints injectés mais non contraignants | Le LLM peut ignorer les suggestions | **Moyenne** |

---

## 5. Recommandations pour la Partie B.3

1. **Tool retrieval par embeddings**: utiliser l'infra RAG existante (`ragMemory.ts`/`MemoryEmbedding`) pour calculer la similarité entre le message utilisateur et les descriptions d'outils. Ne présenter que les 15-25 outils les plus pertinents.

2. **Normalisation de texte**: accent-insensitive matching + fuzzy matching (Levenshtein distance ≤2) en fallback des embeddings.

3. **Scoring de confiance**: si le top outil a un score < 0.7, l'agent demande une clarification au lieu d'exécuter au hasard.

4. **Instrumentation**: ajouter `tool_routing_accuracy` dans Prometheus avant de changer le routeur, pour mesurer l'avant/après.

5. **Règle projet**: tout nouvel outil ajouté (Partie A ou future) doit venir avec ses formulations de test dans `nlu-test-cases.json`.
