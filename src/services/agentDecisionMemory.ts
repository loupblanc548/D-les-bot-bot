/**
 * agentDecisionMemory.ts — Mémoire des décisions autonomes de l'agent
 *
 * Stocke les décisions passées pour:
 *  - Éviter de répéter des actions qui ont échoué
 *  - Renforcer les actions qui ont réussi
 *  - Fournir un contexte pour les futures décisions
 *
 * Fallback en mémoire si la table Prisma n'existe pas.
 */

import logger from "../utils/logger.js";
import prisma from "../prisma.js";

export interface AgentDecision {
  id?: string;
  type: string;
  action: string;
  success: boolean;
  context?: string;
  createdAt?: Date;
}

const memoryStore: AgentDecision[] = [];
const MAX_MEMORY = 500;

export async function recordDecision(decision: Omit<AgentDecision, "id" | "createdAt">): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "AgentDecision" ("type", "action", "success", "context", "createdAt")
      VALUES (${decision.type}, ${decision.action}, ${decision.success}, ${decision.context ?? ""}, NOW())
      ON CONFLICT DO NOTHING
    `;
  } catch {
    memoryStore.push({ ...decision, id: `mem_${memoryStore.length}`, createdAt: new Date() });
    if (memoryStore.length > MAX_MEMORY) memoryStore.shift();
  }
}

export async function getRecentDecisions(type: string, limit = 5): Promise<AgentDecision[]> {
  try {
    const rows = await prisma.$queryRaw<AgentDecision[]>`
      SELECT * FROM "AgentDecision"
      WHERE "type" = ${type}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `;
    if (rows && rows.length > 0) return rows;
  } catch {
    // Fallback
  }
  return memoryStore.filter((d) => d.type === type).slice(-limit).reverse();
}

export async function getFailedDecisions(type: string, limit = 3): Promise<AgentDecision[]> {
  try {
    const rows = await prisma.$queryRaw<AgentDecision[]>`
      SELECT * FROM "AgentDecision"
      WHERE "type" = ${type} AND "success" = false
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `;
    if (rows && rows.length > 0) return rows;
  } catch {
    // Fallback
  }
  return memoryStore.filter((d) => d.type === type && !d.success).slice(-limit).reverse();
}

export async function wasRecentAction(type: string, actionSubstring: string, withinMinutes = 60): Promise<boolean> {
  const recent = await getRecentDecisions(type, 10);
  const cutoff = Date.now() - withinMinutes * 60 * 1000;
  return recent.some(
    (d) => d.createdAt && new Date(d.createdAt).getTime() > cutoff && d.action.toLowerCase().includes(actionSubstring.toLowerCase()),
  );
}

export async function getConfidenceScore(type: string): Promise<number> {
  const recent = await getRecentDecisions(type, 20);
  if (recent.length === 0) return 75;
  const successes = recent.filter((d) => d.success).length;
  const failures = recent.length - successes;
  return Math.max(10, Math.min(100, 75 + successes * 2 - failures * 5));
}

export async function cleanupOldDecisions(): Promise<void> {
  try {
    await prisma.$executeRaw`DELETE FROM "AgentDecision" WHERE "createdAt" < NOW() - INTERVAL '30 days'`;
    logger.info("[DecisionMemory] Vieilles décisions nettoyées");
  } catch {
    // Non-critique
  }
}
