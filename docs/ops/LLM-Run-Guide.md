# Guide LLM Local (Ollama)

## Installation d'Ollama

### Linux (VPS)

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Configuration systemd (optimisations)

```ini
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_FLASH_ATTENTION=1"
```

```bash
systemctl daemon-reload
systemctl restart ollama
```

## Modèles recommandés

| VPS RAM         | Modèle          | Vitesse | Qualité    |
| --------------- | --------------- | ------- | ---------- |
| 8GB             | qwen2.5:3b      | Rapide  | Basique    |
| 8GB + 16GB swap | qwen2.5:7b-fast | Moyenne | Bonne      |
| 16GB+           | qwen2.5:14b     | Lente   | Excellente |

## Pull et création du modèle optimisé

```bash
# Pull de base
ollama pull qwen2.5:7b

# Créer un modèle optimisé (context window réduit)
echo 'FROM qwen2.5:7b' > /tmp/MF
echo 'PARAMETER num_ctx 4096' >> /tmp/MF
echo 'PARAMETER num_predict 300' >> /tmp/MF
echo 'PARAMETER temperature 0.7' >> /tmp/MF
echo 'PARAMETER top_p 0.9' >> /tmp/MF
echo 'PARAMETER repeat_penalty 1.1' >> /tmp/MF
ollama create qwen2.5:7b-fast -f /tmp/MF
```

## Variables d'environnement (.env)

```env
LOCAL_LLM_URL=http://127.0.0.1:11434/v1
LOCAL_LLM_MODEL=qwen2.5:7b-fast
LOCAL_LLM_ENABLED=true
```

## Vérification

```bash
# Script de healthcheck
chmod +x scripts/check_local_llm.sh
./scripts/check_local_llm.sh

# Test manuel
curl http://127.0.0.1:11434/v1/models | jq .

# Test chat
curl -X POST http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5:7b-fast","messages":[{"role":"user","content":"Hello"}]}' | jq .
```

## Docker Compose (Ollama + Bot)

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        limits:
          memory: 6G

  bot:
    # ... configuration existante
    environment:
      - LOCAL_LLM_URL=http://ollama:11434/v1
      - LOCAL_LLM_MODEL=qwen2.5:7b-fast
      - LOCAL_LLM_ENABLED=true
```

## Pré-warm et Health Check

Le bot pré-charge automatiquement le modèle au démarrage (`preWarmLocalModel`).
Un health check périodique (60s) vérifie la disponibilité d'Ollama.

Si Ollama devient indisponible, le bot fallback automatiquement vers OpenRouter/Groq.

## Monitoring

```bash
# Statut Ollama
ollama list

# RAM utilisée
free -h

# Process
ps aux | grep ollama

# Logs
journalctl -u ollama -f
```
