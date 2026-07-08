/**
 * tokenTracker.ts — Tracking de consommation de tokens IA
 *
 * Suit l'utilisation des tokens par utilisateur, commande, et modèle.
 * Cache en mémoire avec calcul de coûts.
 */

import logger from "../utils/logger.js";

export interface TokenUsage {
  userId: string;
  command: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  timestamp: Date;
}

const usageCache = new Map<string, TokenUsage[]>();

const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "openai/gpt-4o": { prompt: 2.5, completion: 10 },
  "anthropic/claude-3.5-sonnet": { prompt: 3, completion: 15 },
  "meta-llama/llama-3.1-70b-instruct": { prompt: 0.59, completion: 0.79 },
  "google/gemini-flash-1.5": { prompt: 0.075, completion: 0.3 },
};

export function trackUsage(usage: Omit<TokenUsage, "timestamp">): void {
  const entry: TokenUsage = { ...usage, timestamp: new Date() };
  const existing = usageCache.get(usage.userId) ?? [];
  existing.push(entry);
  if (existing.length > 1000) existing.shift();
  usageCache.set(usage.userId, existing);
}

export function getUsage(
  userId: string,
  timeframe: "day" | "week" | "month" = "day",
): TokenUsage[] {
  const all = usageCache.get(userId) ?? [];
  const now = Date.now();
  const cutoff =
    timeframe === "day" ? 86_400_000 : timeframe === "week" ? 604_800_000 : 2_592_000_000;
  return all.filter((u) => now - u.timestamp.getTime() < cutoff);
}

export function getUsageStats(userId: string): {
  totalTokens: number;
  totalCost: number;
  byCommand: Record<string, number>;
  byModel: Record<string, number>;
} {
  const all = usageCache.get(userId) ?? [];
  let totalTokens = 0;
  let totalCost = 0;
  const byCommand: Record<string, number> = {};
  const byModel: Record<string, number> = {};

  for (const u of all) {
    const tokens = u.inputTokens + u.outputTokens;
    totalTokens += tokens;
    byCommand[u.command] = (byCommand[u.command] ?? 0) + tokens;
    byModel[u.model] = (byModel[u.model] ?? 0) + tokens;

    const pricing = MODEL_PRICING[u.model];
    if (pricing) {
      totalCost +=
        (u.inputTokens / 1_000_000) * pricing.prompt +
        (u.outputTokens / 1_000_000) * pricing.completion;
    }
  }

  return {
    totalTokens,
    totalCost: Math.round(totalCost * 10000) / 10000,
    byCommand,
    byModel,
  };
}

export function getGlobalStats(): {
  totalUsers: number;
  totalTokens: number;
  avgTokensPerUser: number;
} {
  let totalTokens = 0;
  let totalUsers = 0;

  for (const [userId, entries] of usageCache) {
    if (entries.length === 0) continue;
    totalUsers++;
    totalTokens += entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
  }

  return {
    totalUsers,
    totalTokens,
    avgTokensPerUser: totalUsers > 0 ? Math.round(totalTokens / totalUsers) : 0,
  };
}

export function resetUsage(userId?: string): void {
  if (userId) {
    usageCache.delete(userId);
  } else {
    usageCache.clear();
  }
  logger.info(`[TokenTracker] Reset usage for ${userId ?? "all users"}`);
}
