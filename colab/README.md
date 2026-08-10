# 🤖 Bot LLM Backend — Google Colab (auto-régénération 24h)

## Principe

1. **Colab** fait tourner Ollama (GPU gratuit T4)
2. **ngrok** expose Ollama via URL publique
3. Le **bot** détecte le changement d'URL et se reconnecte automatiquement
4. **Toutes les 24h**, Colab redémarre la session → nouvelle URL ngrok → le bot se met à jour

## Setup

### 1. Notebook Colab (`colab/ollama_backend.ipynb`)

Ouvrir dans Colab (Runtime > GPU T4) et exécuter toutes les cellules.

### 2. Variables d'environnement côté bot

```env
# Au lieu d'une URL fixe, le bot lit l'URL depuis un fichier ou une API
LOCAL_LLM_ENABLED=true
LOCAL_LLM_MODEL=qwen2.5:7b
# LLM_DYNAMIC_URL=true indique au bot de polling l'URL
LLM_DYNAMIC_URL=true
LLM_DYNAMIC_URL_FILE=/opt/bot/data/colab_url.txt
LLM_DYNAMIC_URL_POLL_MS=30000
```

### 3. Script de régénération (`colab/keep_alive.py`)

Tourne dans Colab, redémarre ngrok toutes les 24h et publie la nouvelle URL.

### 4. Côté bot — `src/services/colabLlm.ts`

Client qui poll l'URL dynamique et se reconnecte quand elle change.

## Limitations

- Colab GPU T4: 16GB VRAM → max `qwen2.5:7b` (quantized)
- Session timeout ~12h (free) / 24h (Colab Pro)
- ngrok URL change à chaque redémarrage
- Dépendance réseau (latence ~200-500ms vs local)

## Avantages

- **Gratuit** (GPU T4 inclus)
- **Performance**: 7B sur GPU = ~30 tokens/s vs ~5 tokens/s sur CPU VPS
- **Pas de charge CPU/RAM sur le VPS**
