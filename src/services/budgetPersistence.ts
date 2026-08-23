/**
 * budgetPersistence.ts — Persistance des budgets et usages IA
 *
 * - Compteurs journaliers: cache en mémoire (fallback) ou Redis (optionnel)
 * - Historique d'usage: Prisma (PostgreSQL) pour rapports et audit
 * - Les compteurs journaliers sont réinitialisés à minuit
 */

import logger from "../utils/logger.js";
import prisma from "../prisma.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PersistedUsageRecord {
  timestamp: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costEur: number;
  latencyMs: number;
  success: boolean;
  fallbackCount?: number;
  fallbackReason?: string;
  userId?: string;
  guildId?: string;
  commandName?: string;
}

interface DailyCounter {
  tokens: number;
  cost: number;
  calls: number;
}

// ─── Compteurs journaliers en mémoire (fallback sans Redis) ──────────────────

const dailyCounters = new Map<string, DailyCounter>();
let dailyCountersDate = getTodayKey();

function getTodayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
}

function resetDailyCountersIfNeeded(): void {
  const today = getTodayKey();
  if (today !== dailyCountersDate) {
    dailyCounters.clear();
    dailyCountersDate = today;
    logger.info("[BudgetPersistence] Daily counters reset");
  }
}

function counterKey(
  scope: string,
  userId?: string,
  guildId?: string,
  commandName?: string,
): string {
  return [scope, userId ?? "*", guildId ?? "*", commandName ?? "*"].join(":");
}

// ─── API publique ────────────────────────────────────────────────────────────

/**
 * Enregistre un usage IA en base (Prisma) et met à jour les compteurs journaliers.
 * Non-bloquant: si Prisma échoue, on log et continue.
 */
export async function persistUsageRecord(record: PersistedUsageRecord): Promise<void> {
  // 1. Mettre à jour les compteurs journaliers en mémoire
  resetDailyCountersIfNeeded();

  const keys = [
    counterKey("global"),
    record.userId ? counterKey("user", record.userId) : null,
    record.guildId ? counterKey("guild", undefined, record.guildId) : null,
    record.guildId && record.commandName
      ? counterKey("cmd", undefined, record.guildId, record.commandName)
      : null,
  ].filter((k): k is string => k !== null);

  for (const k of keys) {
    const current = dailyCounters.get(k) ?? { tokens: 0, cost: 0, calls: 0 };
    current.tokens += record.totalTokens;
    current.cost += record.costEur;
    current.calls += 1;
    dailyCounters.set(k, current);
  }

  // 2. Persister en base (fire-and-forget, non-bloquant)
  void prisma.aiUsageLog
    .create({
      data: {
        timestamp: new Date(record.timestamp),
        provider: record.provider,
        model: record.model,
        promptTokens: record.promptTokens,
        completionTokens: record.completionTokens,
        totalTokens: record.totalTokens,
        costEur: record.costEur,
        latencyMs: record.latencyMs,
        success: record.success,
        fallbackCount: record.fallbackCount ?? 0,
        fallbackReason: record.fallbackReason ?? null,
        userId: record.userId ?? null,
        guildId: record.guildId ?? null,
        commandName: record.commandName ?? null,
      },
    })
    .catch((err: unknown) => {
      logger.debug(
        `[BudgetPersistence] Prisma persist failed (non-critical): ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

/**
 * Récupère les compteurs journaliers pour un scope donné.
 */
export function getDailyUsage(
  scope: "global" | "user" | "guild" | "cmd",
  userId?: string,
  guildId?: string,
  commandName?: string,
): DailyCounter {
  resetDailyCountersIfNeeded();
  const key = counterKey(scope, userId, guildId, commandName);
  return dailyCounters.get(key) ?? { tokens: 0, cost: 0, calls: 0 };
}

/**
 * Récupère l'historique d'usage depuis Prisma.
 */
export async function getUsageHistory(filter: {
  userId?: string;
  guildId?: string;
  provider?: string;
  since?: Date;
  limit?: number;
}): Promise<PersistedUsageRecord[]> {
  try {
    const records = await prisma.aiUsageLog.findMany({
      where: {
        userId: filter.userId,
        guildId: filter.guildId,
        provider: filter.provider,
        timestamp: filter.since ? { gte: filter.since } : undefined,
      },
      orderBy: { timestamp: "desc" },
      take: filter.limit ?? 100,
    });

    return records.map((r: (typeof records)[number]) => ({
      timestamp: r.timestamp.getTime(),
      provider: r.provider,
      model: r.model,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
      costEur: r.costEur,
      latencyMs: r.latencyMs,
      success: r.success,
      fallbackCount: r.fallbackCount,
      fallbackReason: r.fallbackReason ?? undefined,
      userId: r.userId ?? undefined,
      guildId: r.guildId ?? undefined,
      commandName: r.commandName ?? undefined,
    }));
  } catch (err) {
    logger.debug(
      `[BudgetPersistence] getUsageHistory failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Vide les compteurs journaliers (utile pour les tests).
 */
export function clearDailyCounters(): void {
  dailyCounters.clear();
}
