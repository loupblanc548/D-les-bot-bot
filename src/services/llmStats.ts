/**
 * llmStats.ts — Track API savings from local LLM usage
 *
 * Counts how many messages were handled locally vs via API,
 * and estimates token/cost savings.
 */

import logger from "../utils/logger.js";
import { getUsageSummary } from "./aiGateway.js";

interface Stats {
  localHandled: number;
  apiHandled: number;
  delegated: number;
  piperTtsUsed: number;
  apiTtsUsed: number;
  startTime: number;
}

const stats: Stats = {
  localHandled: 0,
  apiHandled: 0,
  delegated: 0,
  piperTtsUsed: 0,
  apiTtsUsed: 0,
  startTime: Date.now(),
};

export function recordLocalLlm(): void {
  stats.localHandled++;
}

export function recordApiLlm(): void {
  stats.apiHandled++;
}

export function recordDelegation(): void {
  stats.delegated++;
}

export function recordPiperTts(): void {
  stats.piperTtsUsed++;
}

export function recordApiTts(): void {
  stats.apiTtsUsed++;
}

export function getStats(): Stats & {
  total: number;
  localPct: number;
  estimatedSavingsTokens: number;
  estimatedSavingsEur: number;
  realTokensUsed: number;
  realCostEur: number;
  uptimeHours: number;
} {
  const total = stats.localHandled + stats.apiHandled;
  const localPct = total > 0 ? Math.round((stats.localHandled / total) * 100) : 0;
  // Legacy estimate (kept for backward compat)
  const estimatedSavingsTokens = stats.localHandled * 500;
  const estimatedSavingsEur = (estimatedSavingsTokens / 1000) * 0.002;
  // Real usage from aiGateway
  const realUsage = getUsageSummary();
  const uptimeHours = (Date.now() - stats.startTime) / (1000 * 60 * 60);

  return {
    ...stats,
    total,
    localPct,
    estimatedSavingsTokens,
    estimatedSavingsEur,
    realTokensUsed: realUsage.totalTokens,
    realCostEur: realUsage.totalCostEur,
    uptimeHours: Math.round(uptimeHours * 10) / 10,
  };
}

export function logStatsSummary(): void {
  const s = getStats();
  logger.info(
    `[Stats] 📊 Local: ${s.localHandled} (${s.localPct}%) | API: ${s.apiHandled} | Délégué: ${s.delegated} | Piper TTS: ${s.piperTtsUsed} | Économie estimée: ~${s.estimatedSavingsTokens} tokens (~${s.estimatedSavingsEur.toFixed(3)}€) | Tokens réels: ${s.realTokensUsed} | Coût réel: ${s.realCostEur.toFixed(4)}€ | Uptime: ${s.uptimeHours}h`,
  );
}
