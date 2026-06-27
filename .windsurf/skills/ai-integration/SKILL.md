# Skill: ai-integration

## Nom
AI Integration — API IA, agents, modèles, embeddings, RAG

## Description
Intégration de fonctionnalités IA dans le bot Discord : API IA (OpenAI/OpenRouter), agents, modèles, embeddings et système RAG (Retrieval-Augmented Generation).

## Quand l'utiliser
- Ajout ou modification d'une fonctionnalité IA (chat, traduction, résumé)
- Intégration d'un nouveau modèle IA
- Ajout d'embeddings pour la mémoire IA
- Configuration du système RAG
- Modification du système de mémoire AI (`UserMemory`, `MemoryFact`, `MemoryEmbedding`)

## Déclencheurs
- "ai integration"
- "intégration ia"
- "openai"
- "openrouter"
- "embeddings"
- "rag"
- "agent ia"
- "modèle ia"

## Prérequis
- OpenAI SDK installé (`openai` dans dependencies)
- Clé API configurée (`OPENROUTER_API_KEY` ou `OPENAI_API_KEY` dans `.env`)
- Comprendre les services IA existants (`src/services/ai.ts` ou similaire)
- Comprendre le schéma AI Memory dans Prisma (`UserMemory`, `MemoryFact`, `MemoryEmbedding`)

## Étapes détaillées

### 1. API IA
- Utiliser le SDK OpenAI (`openai` package) pour les appels API
- Configurer le client avec la clé API et le base URL (OpenRouter si utilisé)
- Gérer les timeouts et les retries
- Gérer les quotas et les limites de taux
- Logger les appels IA (tokens utilisés, latence) via `ChatConversation` (Prisma)

### 2. Agents
- Créer un agent dans `src/services/` si nécessaire
- Définir le system prompt (configurable via `GuildConfig.aiSystemPrompt`)
- Gérer l'historique de conversation (`ChatHistory`, `ChatConversation` dans Prisma)
- Implémenter la gestion du contexte (fenêtre de tokens)
- Ajouter des tools/functions si nécessaire (function calling)

### 3. Modèles
- Choisir le modèle approprié (GPT-4, GPT-3.5, Claude, etc. via OpenRouter)
- Configurer les paramètres (temperature, max_tokens, top_p)
- Gérer le fallback entre modèles
- Surveiller les coûts (tokens entrants/sortants)

### 4. Embeddings
- Utiliser les embeddings OpenAI pour la similarité sémantique
- Stocker les embeddings dans `MemoryEmbedding` (Prisma — champ `embedding` en JSON)
- Calculer la similarité cosinus pour la recherche sémantique
- Utiliser les embeddings pour la mémoire IA (retrieval de faits pertinents)

### 5. RAG (Retrieval-Augmented Generation)
- Indexer les données dans `MemoryEmbedding` avec leurs embeddings
- Pour une requête utilisateur :
  1. Calculer l'embedding de la requête
  2. Rechercher les faits/messages similaires (similarité cosinus)
  3. Construire le contexte avec les résultats récupérés
  4. Envoyer le contexte + la requête au modèle IA
  5. Retourner la réponse générée
- Gérer le decay des faits (`MemoryDecayLog` pour le suivi)

## Commandes exécutables
```bash
npm test                           # Tests
npm run lint                       # Lint
npx tsc --noEmit                   # Type check
npx prisma generate                # Régénérer Prisma si le schéma AI Memory change
```

## Vérifications finales
- [ ] L'API IA répond correctement
- [ ] Les erreurs API sont gérées (timeouts, quotas, erreurs réseau)
- [ ] Les tokens sont logger dans `ChatConversation`
- [ ] Les embeddings sont stockés et récupérables
- [ ] Le système RAG fonctionne (retrieval + génération)
- [ ] Le system prompt est configurable via GuildConfig
- [ ] Aucune clé API dans le code source

## Gestion des erreurs
- Si l'API IA timeout : augmenter le timeout ou ajouter un retry
- Si le quota est dépassé : informer l'utilisateur et logger l'erreur
- Si les embeddings sont trop lents : mettre en cache les résultats
- Si la réponse IA est vide : vérifier le system prompt et le contexte

## Bonnes pratiques
- Ne jamais hardcoder de clé API — utiliser `.env`
- Logger les tokens utilisés pour le suivi des coûts
- Utiliser le system prompt configurable via GuildConfig
- Implémenter le decay des faits pour éviter l'accumulation de mémoire inutile
- Gérer la fenêtre de contexte (tronquer l'historique si trop long)
- Utiliser `ChatHistory` pour l'historique par channel et `ChatConversation` pour le suivi des tokens
