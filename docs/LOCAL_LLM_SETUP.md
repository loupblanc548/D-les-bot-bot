# =============================================================================
# Configuration LLM Local — Mini PC (Standby)
# =============================================================================
#
# Status: STANDBY — VPS 8 Go jusqu'à décembre–janvier, puis mini PC 24/7
#
# Transfert: depuis le VPS, `bash scripts/pack-minipc.sh` → dist/minipc-bundle.tar.gz
# (le .env avec les tokens se copie à part, pas dans l'archive).
#
# Hardware: Lenovo ThinkCentre M910q Tiny
#   - CPU: Intel Core i7-6700T (4 cores / 8 threads @ 2.5-3.4 GHz)
#   - RAM: 16 GB
#   - SSD: 512 GB
#   - OS: Windows 11 Pro
#   - GPU: Intel HD Graphics 630 (intégré — pas de GPU dédié)
#
# =============================================================================
# ÉTAPE 1: Installer Ollama sur le Mini PC
# =============================================================================
#
# 1. Télécharger Ollama pour Windows: https://ollama.com/download
# 2. Installer et lancer Ollama
# 3. Ouvrir PowerShell et tirer le modèle:
#
#    ollama pull qwen2.5:7b
#
# 4. Vérifier que ça marche:
#
#    ollama run qwen2.5:7b "Bonjour, ça va ?"
#
# =============================================================================
# ÉTAPE 2: Configurer Ollama pour écouter sur le réseau
# =============================================================================
#
# ⚠️  SÉCURITÉ CRITIQUE — NE JAMAIS EXPOSER OLLAMA SUR 0.0.0.0
#
# Ollama n'a AUCUNE authentification native. Exposer le port 11434
# sur Internet = n'importe qui peut utiliser votre LLM gratuitement.
#
# --- Solution recommandée: Tailscale (VPN privé gratuit) ---
#
# 1. Installer Tailscale sur le VPS ET le mini PC:
#    curl -fsSL https://tailscale.com/install.sh | sh  (Linux)
#    ou télécharger depuis https://tailscale.com/download (Windows)
#
# 2. Connecter les deux machines au même compte Tailscale:
#    tailscale up
#
# 3. Récupérer l'IP Tailscale du mini PC (100.x.x.x):
#    tailscale ip
#
# 4. Configurer Ollama pour n'écouter QUE sur l'IP du tunnel:
#    PowerShell (Admin): $env:OLLAMA_HOST = "100.x.x.x:11434"
#    ou variable système: OLLAMA_HOST = 100.x.x.x:11434
#
# 5. Vérifier que le port 11434 n'est PAS accessible depuis Internet:
#    curl http://IP_PUBLIQUE_MINI_PC:11434  -> doit échouer
#    curl http://100.x.x.x:11434            -> doit réussir depuis le VPS
#
# --- Alternative: reverse proxy nginx avec authentification ---
#
# Si Tailscale n'est pas envisageable, mettre nginx devant Ollama:
#   server {
#     listen 11434;
#     auth_basic "Ollama";
#     auth_basic_user_file /etc/nginx/.htpasswd;
#     proxy_pass http://127.0.0.1:11434;
#   }
# Et configurer OLLAMA_HOST=127.0.0.1:11434 (localhost uniquement)
#
# =============================================================================
# ÉTAPE 3: Activer dans le .env du bot
# =============================================================================
#
# Cas A — Bot sur le VPS, mini PC comme serveur LLM distant:
#
#   LOCAL_LLM_URL=http://IP_DU_MINI_PC:11434/v1
#   LOCAL_LLM_MODEL=qwen2.5:7b
#
# Cas B — Bot ET Ollama sur le mini PC (après expiration du VPS):
#
#   LOCAL_LLM_URL=http://127.0.0.1:11434/v1
#   LOCAL_LLM_MODEL=qwen2.5:7b
#
# Le code du bot (src/services/localLlm.ts) est déjà prêt.
# Il suffit de définir ces deux variables dans .env et redémarrer le bot.
#
# =============================================================================
# ÉTAPE 4: Vérification de sécurité (obligatoire)
# =============================================================================
#
# Après configuration, VÉRIFIER que Ollama n'est pas exposé publiquement:
#
# 1. Depuis une machine externe (ex: téléphone en 4G):
#    curl http://IP_PUBLIQUE_MINI_PC:11434/api/tags
#    -> doit retourner Connection refused ou timeout
#
# 2. Si le port a déjà été exposé sans protection:
#    - Vérifier les logs Ollama: journalctl -u ollama (Linux)
#    - ou %LOCALAPPDATA%/Ollama/logs (Windows)
#    - Chercher des requêtes d'IPs non reconnues
#    - Considérer que le modèle a pu être utilisé par des tiers
#
# 3. Firewall Windows Defender (couche supplémentaire):
#    Autoriser le port 11434 UNIQUEMENT pour l'IP Tailscale du VPS
#
# =============================================================================
# Modèles alternatifs (si qwen2.5:7b est trop lent)
# =============================================================================
#
# ollama pull qwen2.5:3b     # Plus rapide, moins précis (~30 tokens/s)
# ollama pull llama3.1:8b    # Légèrement meilleur mais plus lent (~12 tokens/s)
# ollama pull qwen2.5:14b    # Très bon mais ~10 GB RAM (~5 tokens/s)
#
# =============================================================================
