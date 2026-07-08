# Tâches pour Agent Externe — Copier-Coller

## Instructions pour l'agent
Tu travailles sur un bot Discord TypeScript dans `d:\les bot\bot`.
Après chaque tâche, lance `npx tsc --noEmit` pour vérifier qu'il n'y a pas d'erreurs.
Ne modifie PAS les fichiers existants sauf indication contraire.
Crée de NOUVEAUX fichiers uniquement.

---

## Tâche 1: Service de traduction (nouveau fichier)

```
Crée le fichier src/services/translateService.ts avec:
- Une fonction async translateText(text: string, targetLang: string): Promise<string>
- Utilise l'API LibreTranslate (URL: https://libretranslate.com/translate, POST avec {q, source: "auto", target, format: "text"})
- Gestion d'erreur: retourne le texte original si l'API échoue
- Cache simple avec Map<string, string> pour éviter les traductions en double
- Exporte aussi: detectLanguage(text: string): Promise<string> (GET https://libretranslate.com/detect)
- Timeout de 5 secondes avec AbortSignal.timeout(5000)
```

---

## Tâche 2: Service de résumé de channel (nouveau fichier)

```
Crée le fichier src/services/channelSummary.ts avec:
- Une fonction async summarizeChannel(messages: string[], maxMessages?: number): Promise<string>
- Récupère les derniers messages d'un channel Discord
- Utilise getOpenAIClient() depuis ./ai.js et config.openRouterModel depuis ../config.js
- Prompt: "Résume ces messages Discord en 3-5 points clés. Sois concis."
- max_tokens: 500, temperature: 0.3, timeout: 15s
- Gestion d'erreur: retourne "Résumé indisponible" si échec
- Importe logger depuis ../utils/logger.js
```

---

## Tâche 3: Service d'historique IA (nouveau fichier)

```
Crée le fichier src/services/aiHistory.ts avec:
- Une interface AiHistoryEntry { id: string; userId: string; command: string; input: string; output: string; timestamp: Date; tokensUsed: number }
- Une fonction async saveAiHistory(entry: Omit<AiHistoryEntry, "id" | "timestamp">): Promise<void> qui sauvegarde dans prisma (import depuis ../prisma.js)
- Une fonction async getAiHistory(userId: string, limit?: number): Promise<AiHistoryEntry[]> qui récupère l'historique
- Une fonction async clearAiHistory(userId: string): Promise<void> qui supprime l'historique
- Une fonction async getAiStats(userId: string): Promise<{ totalRequests: number; totalTokens: number; mostUsedCommand: string }> qui calcule des stats
- Gestion d'erreur avec try/catch et logger depuis ../utils/logger.js
- Limit par défaut: 50
```

---

## Tâche 4: Service d'export de chat (nouveau fichier)

```
Crée le fichier src/services/chatExport.ts avec:
- Une interface ChatExportMessage { author: string; content: string; timestamp: Date; attachments?: string[] }
- Une fonction async exportChannelMessages(channelId: string, limit?: number): Promise<ChatExportMessage[]>
  - Récupère les messages via l'API Discord (utilise fetch sur https://discord.com/api/v10/channels/{channelId}/messages?limit={limit})
  - Headers: Authorization: Bot {token} (récupère le token depuis ../config.js)
  - Limit par défaut: 100
- Une fonction async exportToJSON(messages: ChatExportMessage[]): Promise<string> qui sérialise en JSON
- Une fonction async exportToMarkdown(messages: ChatExportMessage[]): Promise<string> qui formate en Markdown avec **[author] - timestamp**: content
- Une fonction async exportToCSV(messages: ChatExportMessage[]): Promise<string> qui formate en CSV (author,content,timestamp)
- Gestion d'erreur avec try/catch et logger depuis ../utils/logger.js
```

---

## Tâche 5: Service de sélection de modèle IA (nouveau fichier)

```
Crée le fichier src/services/modelSelector.ts avec:
- Une interface ModelInfo { id: string; name: string; contextLength: number; pricing: { prompt: number; completion: number }; capabilities: string[] }
- Un array AVAILABLE_MODELS: ModelInfo[] avec 5 modèles:
  1. { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", contextLength: 128000, pricing: { prompt: 0.15, completion: 0.6 }, capabilities: ["chat", "vision", "json"] }
  2. { id: "openai/gpt-4o", name: "GPT-4o", contextLength: 128000, pricing: { prompt: 2.5, completion: 10 }, capabilities: ["chat", "vision", "json", "reasoning"] }
  3. { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", contextLength: 200000, pricing: { prompt: 3, completion: 15 }, capabilities: ["chat", "vision", "json", "reasoning"] }
  4. { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B", contextLength: 131072, pricing: { prompt: 0.59, completion: 0.79 }, capabilities: ["chat", "json"] }
  5. { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5", contextLength: 1000000, pricing: { prompt: 0.075, completion: 0.3 }, capabilities: ["chat", "vision", "json"] }
- Une fonction selectModel(task: "moderation" | "chat" | "analysis" | "code"): ModelInfo
  - moderation -> gpt-4o-mini (rapide)
  - chat -> gemini-flash-1.5 (long contexte)
  - analysis -> claude-3.5-sonnet (raisonnement)
  - code -> gpt-4o (précision code)
- Une fonction getModelById(id: string): ModelInfo | null
- Une fonction listModels(): ModelInfo[]
- Une fonction estimateCost(model: ModelInfo, inputTokens: number, outputTokens: number): number
```

---

## Tâche 6: Service de tracking de tokens (nouveau fichier)

```
Crée le fichier src/services/tokenTracker.ts avec:
- Une interface TokenUsage { userId: string; command: string; inputTokens: number; outputTokens: number; model: string; timestamp: Date }
- Un Map<string, TokenUsage[]> en mémoire pour le cache
- Une fonction trackUsage(usage: Omit<TokenUsage, "timestamp">): void qui ajoute au cache
- Une fonction getUsage(userId: string, timeframe?: "day" | "week" | "month"): TokenUsage[]
  - Filtre par timeframe (par défaut: day)
- Une fonction getUsageStats(userId: string): { totalTokens: number; totalCost: number; byCommand: Record<string, number>; byModel: Record<string, number> }
- Une fonction getGlobalStats(): { totalUsers: number; totalTokens: number; avgTokensPerUser: number }
- Une fonction resetUsage(userId?: string): void (reset tout si pas de userId)
- Importe estimateCost depuis ./modelSelector.js pour calculer les coûts
```

---

## Tâche 7: Service de résumé utilisateur (nouveau fichier)

```
Crée le fichier src/services/userSummary.ts avec:
- Une interface UserSummary { userId: string; username: string; messageCount: number; topChannels: string[]; sentimentTrend: "positive" | "neutral" | "negative"; riskLevel: string; joinedAt: Date; lastActive: Date; achievements: string[] }
- Une fonction async generateUserSummary(userId: string, guildId: string): Promise<UserSummary>
  - Récupère les données depuis prisma (import depuis ../prisma.js): userActivityLog, modAction
  - Compte les messages par channel
  - Détermine la tendance de sentiment (basique: compte des activités positives vs négatives)
  - Détermine le riskLevel basé sur le nombre de modActions
  - Génère des achievements (ex: "Très actif" si > 100 messages, "Zéro sanction" si 0 modAction)
- Une fonction async generateUserEmbed(summary: UserSummary): Promise<EmbedBuilder>
  - Crée un embed Discord coloré avec les infos du summary
  - Importe EmbedBuilder depuis discord.js
- Gestion d'erreur avec try/catch et logger depuis ../utils/logger.js
```

---

## Vérification

Après que l'agent a terminé, je vérifierai:
1. `npx tsc --noEmit` — 0 erreurs TypeScript
2. `npx vitest run` — tous les tests passent
3. Chaque fichier créé respecte les imports et types demandés
4. Aucun fichier existant n'a été modifié incorrectement
