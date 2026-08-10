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
