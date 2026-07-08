/**
 * aiHistory.ts — Historique des commandes IA
 *
 * Sauvegarde et récupère l'historique des interactions IA en base.
 */

import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export interface AiHistoryEntry {
  id: string;
  userId: string;
  command: string;
  input: string;
  output: string;
  timestamp: Date;
  tokensUsed: number;
  model?: string;
}

export async function saveAiHistory(
  entry: Omit<AiHistoryEntry, "id" | "timestamp">,
): Promise<void> {
  try {
    await prisma.aiHistory.create({
      data: {
        userId: entry.userId,
        command: entry.command,
        input: entry.input.slice(0, 2000),
        output: entry.output.slice(0, 4000),
        tokensUsed: entry.tokensUsed,
        model: entry.model,
      },
    });
  } catch (error) {
    logger.error("[AiHistory] saveAiHistory:", String(error));
  }
}

export async function getAiHistory(
  userId: string,
  limit = 50,
): Promise<AiHistoryEntry[]> {
  try {
    const records = await prisma.aiHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return records.map((r) => ({
      id: String(r.id),
      userId: r.userId,
      command: r.command,
      input: r.input,
      output: r.output,
      timestamp: r.createdAt,
      tokensUsed: r.tokensUsed,
      model: r.model ?? undefined,
    }));
  } catch (error) {
    logger.error("[AiHistory] getAiHistory:", String(error));
    return [];
  }
}

export async function clearAiHistory(userId: string): Promise<void> {
  try {
    await prisma.aiHistory.deleteMany({ where: { userId } });
  } catch (error) {
    logger.error("[AiHistory] clearAiHistory:", String(error));
  }
}

export async function getAiStats(userId: string): Promise<{
  totalRequests: number;
  totalTokens: number;
  mostUsedCommand: string;
}> {
  try {
    const records = await prisma.aiHistory.findMany({
      where: { userId },
      select: { command: true, tokensUsed: true },
    });

    const totalRequests = records.length;
    const totalTokens = records.reduce((sum, r) => sum + r.tokensUsed, 0);

    const commandCounts: Record<string, number> = {};
    for (const r of records) {
      commandCounts[r.command] = (commandCounts[r.command] ?? 0) + 1;
    }
    const mostUsedCommand =
      Object.entries(commandCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "none";

    return { totalRequests, totalTokens, mostUsedCommand };
  } catch (error) {
    logger.error("[AiHistory] getAiStats:", String(error));
    return { totalRequests: 0, totalTokens: 0, mostUsedCommand: "none" };
  }
}
