# =============================================================================
# Configuration LLM Local — Mini PC (Standby)
# =============================================================================
#
# Status: STANDBY — En attente de la fin de l'abonnement VPS (décembre 2026)
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
# Si le bot reste sur le VPS et le mini PC sert de serveur LLM distant:
#
# PowerShell (Admin):
#   $env:OLLAMA_HOST = "0.0.0.0:11434"
#   ollama serve
#
# Pour persistant, créer une variable d'environnement système:
#   Paramètres → Système → À propos → Variables d'environnement
#   OLLAMA_HOST = 0.0.0.0:11434
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
# ÉTAPE 4: Sécurité (si le mini PC est exposé à internet)
# =============================================================================
#
# Ollama n'a pas d'authentification. Si le mini PC est sur le même réseau
# local que le VPS (VPN/tunnel), c'est OK. Sinon, utiliser un firewall:
#
# Windows Defender Firewall:
#   Autoriser le port 11434 uniquement pour l'IP du VPS
#
# Ou utiliser Tailscale/WireGuard pour un tunnel chiffré.
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
