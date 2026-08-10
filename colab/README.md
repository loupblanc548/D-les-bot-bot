# 🤖 Bot LLM Backend — Google Colab (auto-régénération 24h)

## Principe

1. **Colab** fait tourner Ollama sur GPU gratuit (T4 16GB ou A100 40GB avec Pro)
2. **ngrok** expose Ollama via URL publique
3. Le **bot** détecte le changement d'URL **et de modèle** et se reconnecte automatiquement
4. **Toutes les 24h**, Colab redémarre la session → nouvelle URL ngrok → le bot se met à jour

## Modèles supportés

| GPU | VRAM | Modèle | RAM | Vitesse | Qualité | Use case |
|-----|------|--------|-----|---------|---------|----------|
| T4 (free) | 16GB | `qwen2.5:7b` | 5GB | ~30 tok/s | Bonne | Chat rapide |
| T4 (free) | 16GB | `qwen2.5:14b` | 10GB | ~15 tok/s | Très bonne | Chat + tools |
| T4 (free) | 16GB | `llama3.1:8b` | 5GB | ~35 tok/s | Bonne | Chat rapide |
| T4 (free) | 16GB | `mistral:7b` | 5GB | ~35 tok/s | Bonne | Chat général |
| T4 (free) | 16GB | `deepseek-r1:7b` | 5GB | ~25 tok/s | Raisonnement | Math, logique |
| T4 (free) | 16GB | `deepseek-r1:14b` | 10GB | ~12 tok/s | Raisonnement++ | Math complexe |
| T4 (free) | 16GB | `phi4:14b` | 10GB | ~15 tok/s | Raisonnement | Code, logique |
| T4 (free) | 16GB | `gemma2:9b` | 7GB | ~25 tok/s | Bonne | Multilingue |
| A100 (Pro) | 40GB | `qwen2.5:32b` | 20GB | ~20 tok/s | Excellente | Chat premium |
| A100 (Pro) | 40GB | `llama3.1:70b` | 40GB | ~8 tok/s | Premium | Tâches complexes |
| A100 (Pro) | 40GB | `deepseek-r1:32b` | 20GB | ~15 tok/s | Top raisonnement | Math, science |

## Setup

### 1. Notebook Colab (`colab/ollama_backend.ipynb`)

Ouvrir dans Colab (Runtime > GPU T4) et exécuter toutes les cellules.
Le notebook détecte automatiquement le GPU et vérifie que le modèle choisi tient en VRAM.

### 2. Variables d'environnement côté bot

```env
LOCAL_LLM_ENABLED=true
LLM_DYNAMIC_URL=true
LLM_DYNAMIC_URL_FILE=/opt/bot/data/colab_url.txt
LLM_DYNAMIC_MODEL_FILE=/opt/bot/data/colab_model.txt
LLM_DYNAMIC_URL_POLL_MS=30000
# Model par défaut (utilisé si le fichier model n'existe pas encore)
LOCAL_LLM_MODEL=qwen2.5:14b
# Ordre de fallback: Colab GPU → VPS CPU → Cloud API
AI_PROVIDER_ORDER=colab,local,openai,openrouter
```

### 3. Switch de modèle à chaud

Le notebook envoie le nom du modèle via le webhook. Le bot le stocke dans un fichier
et l'utilise automatiquement. **Pas besoin de redémarrer le bot pour changer de modèle.**

Changer `MODEL_NAME` dans la cellule 2 du notebook → relancer → le bot détecte le nouveau modèle.

## Avantages vs VPS CPU seul

| Métrique | VPS CPU | Colab GPU T4 | Colab A100 (Pro) |
|----------|---------|-------------|------------------|
| Max modèle | 14B (lent) | 14B (rapide) | 70B |
| Tokens/s (7B) | ~5 | ~30 | ~60 |
| Tokens/s (14B) | ~2 | ~15 | ~35 |
| RAM VPS | 9GB | 0 | 0 |
| Coût GPU | 0 | Gratuit | $10/mois |
| Régénération | N/A | Auto 24h | Auto 24h |

## Limitations

- Colab free: session ~12h max (24h avec Pro)
- ngrok URL change à chaque redémarrage
- Latence réseau: ~200-500ms vs local
- Colab peut déconnecter en cas d'inactivité (le keep-alive prévient ça)

---

## 🛠️ Colab Tools Backend — Tâches GPU

Le second notebook (`colab/tools_backend.ipynb`) expose une API FastAPI sur GPU Colab pour les tâches lourdes que le VPS ne peut pas faire efficacement :

### Endpoints

| Endpoint | Description | Service VPS fallback |
|----------|-------------|---------------------|
| `POST /nsfw` | Classification NSFW d'image | `nsfwClassifier.ts` → Sightengine/Gemini |
| `POST /ai-detect` | Détection image générée par IA | `aiAvatarDetector.ts` → Sightengine/HF |
| `POST /remove-bg` | Suppression de fond (rembg) | `removeBg.ts` → remove.bg API (payant) |
| `POST /screenshot` | Capture d'écran (Playwright) | `screenshotTool.ts` → Playwright VPS |
| `POST /transcribe` | Transcription audio (Whisper) | `assemblyAi.ts` → AssemblyAI API (payant) |
| `POST /embeddings` | Embeddings texte (RAG) | `vectorMemory.ts` → OpenAI embeddings |
| `GET /health` | Health check | — |

### Architecture de fallback

```
Requête bot → Colab Tools GPU (gratuit)
                  ↓ si indisponible
              Service VPS existant
                  ↓ si pas configuré
              API cloud payante (Sightengine, AssemblyAI, remove.bg)
                  ↓ si rien
              Désactivé / skip
```

### Intégration automatique

Les services suivants utilisent **automatiquement** Colab Tools quand disponible, avec fallback transparent :

- `src/services/nsfwClassifier.ts` — `classifyNsfw()` → Colab GPU → Sightengine → Gemini
- `src/services/aiAvatarDetector.ts` — `detectAIMedia()` → Colab GPU → Sightengine → HuggingFace
- `src/services/removeBg.ts` — `removeBackground()` → Colab GPU (rembg) → remove.bg API
- `src/services/screenshotTool.ts` — `takeScreenshot()` → Colab GPU (Playwright) → VPS Playwright
- `src/services/assemblyAi.ts` — `transcribeAudio()` → Colab GPU (Whisper) → AssemblyAI API

### Variables d'environnement

```env
# Colab Tools (optionnel — si non défini, le bot utilise les services VPS)
COLAB_TOOLS_URL=https://abc123.ngrok.io
# OU mode dynamique (URL file polling)
COLAB_TOOLS_URL_FILE=/opt/bot/data/colab_tools_url.txt
COLAB_TOOLS_TIMEOUT_MS=30000
```

### Webhook

Le notebook notifie le bot quand l'URL change :
```
POST /webhook/colab-tools-url
{ "url": "https://new-url.ngrok.io", "type": "tools" }
```

---

## ⛏️ Baritone Backend — Minecraft Java AI Pathfinding

Le troisième notebook (`colab/baritone_backend.ipynb`) fait tourner un client Minecraft Java headless avec le mod [Baritone](https://github.com/brg123/Baritone) sur Colab.

### Ce que Baritone fait

| Commande | Description |
|----------|-------------|
| `#goto x z` | Pathfinding IA vers des coordonnées (A*, évite lave/chutes) |
| `#mine diamond_ore` | Auto-mining intelligent (scan + pathfind vers les minerais) |
| `#follow Player1` | Suivre un joueur automatiquement |
| `#explore` | Explorer le monde automatiquement |
| `#build house` | Construire des structures depuis des schémas |
| `#stop` | Arrêter le pathfinding |

### Architecture

```
Discord Bot → POST /command → Colab FastAPI → xdotool tape dans le chat MC
                                     ↓
                              Minecraft Java 1.21 + Fabric + Baritone
                                     ↓
                              Log file → GET /status → Bot lit le statut
```

### Endpoints API

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /status` | Statut MC (position, vie, faim, tâche Baritone) |
| `POST /command` | Envoyer commande Baritone (`#goto`, `#mine`, etc.) |
| `POST /chat` | Envoyer message chat normal |
| `POST /settings` | Modifier paramètre Baritone en runtime |
| `POST /stop` | Arrêter Baritone |
| `POST /force-disconnect` | Kill le client MC |
| `GET /log?lines=N` | Lire les dernières lignes du log MC |

### Intégration Discord

Le bot expose les commandes slash suivantes quand Baritone est disponible :

- `/mc goto <x> <z>` — Aller à des coordonnées
- `/mc mine <ore>` — Miner un minerai spécifique
- `/mc follow <player>` — Suivre un joueur
- `/mc explore` — Explorer le monde
- `/mc stop` — Arrêter Baritone
- `/mc status` — Statut du bot MC
- `/mc log` — Voir les derniers logs

### Variables d'environnement

```env
# Baritone (optionnel — si non défini, utilise le bot Bedrock existant)
BARITONE_URL=https://abc123.ngrok.io
# OU mode dynamique
BARITONE_DYNAMIC_URL=true
BARITONE_URL_FILE=/opt/bot/data/baritone_url.txt
BARITONE_TIMEOUT_MS=15000
```

### Webhook

```
POST /webhook/baritone-url
{ "url": "https://new-url.ngrok.io", "type": "baritone" }
```

### Différence avec le bot Bedrock existant

| Feature | Bot Bedrock (VPS) | Baritone (Colab) |
|---------|-------------------|------------------|
| Edition | Bedrock | Java |
| Pathfinding | Manuel (strip/branch) | IA A* (évite dangers) |
| Auto-mine | Basique (ligne droite) | Intelligent (scan + target) |
| Follow | Simple tracking | Pathfinding complet |
| Build | Non | Oui (schémas) |
| Explore | Non | Oui |
| Coût VPS | CPU/RAM | 0 (Colab) |
