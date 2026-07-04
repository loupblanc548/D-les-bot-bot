/**
 * memoryGrooming.ts — Consolidation nocturne du cerveau (Memory Grooming)
 *
 * Tous les jours à 04h05 (juste après NotificationCleanup à 04h00).
 * Utilise un LLM large-contexte pour analyser les faits, messages et liens
 * créés dans les dernières 24h, dédupliquer, résoudre les contradictions
 * et générer un résumé condensé du profil sémantique de chaque utilisateur actif.
 */

import cron, { type ScheduledTask } from "node-cron";
import { Client } from "discord.js";
import * as Sentry from "@sentry/node";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const GROOMING_CRON_EXPRESSION = "5 4 * * *"; // 04h05 tous les jours
const GROOMING_MODEL = process.env.GROOMING_MODEL || "z-ai/glm-4.6:free";
const MAX_USERS_PER_RUN = 20;
const MAX_FACTS_PER_USER = 50;
const MAX_LINKS_PER_USER = 30;

interface FactRow {
  id: string;
  key: string;
  value: string;
  category: string | null;
  weight: number;
}

interface LinkRow {
  id: string;
  sourceKey: string;
  targetKey: string;
  relation: string;
  strength: number;
}

interface ConsolidationPlan {
  duplicates: Array<{ keepId: string; removeIds: string[]; mergedValue: string }>;
  contradictions: Array<{ winningId: string; losingIds: string[]; resolvedValue: string }>;
  updatedSummary: string;
  linksToMerge: Array<{ keepId: string; removeIds: string[] }>;
}

let cronJob: ScheduledTask | null = null;

/**
 * Récupère les utilisateurs actifs dans les dernières 24h.
 */
async function getActiveUsers(since: Date): Promise<string[]> {
  const users = await prisma.userMemory.findMany({
    where: { lastActiveAt: { gte: since } },
    select: { userId: true },
    orderBy: { lastActiveAt: "desc" },
    take: MAX_USERS_PER_RUN,
  });
  return users.map((u) => u.userId);
}

/**
 * Appelle le LLM pour consolider les faits et liens d'un utilisateur.
 */
async function consolidateWithLLM(
  userId: string,
  facts: FactRow[],
  links: LinkRow[],
  currentSummary: string | null,
): Promise<ConsolidationPlan | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn("[MemoryGrooming] OPENROUTER_API_KEY manquant — skip");
    return null;
  }

  const factsText = facts
    .map((f) => `  ${f.id} | ${f.key}: ${f.value} (cat=${f.category}, w=${f.weight.toFixed(1)})`)
    .join("\n");

  const linksText = links
    .map(
      (l) =>
        `  ${l.id} | ${l.sourceKey} --${l.relation}--> ${l.targetKey} (×${l.strength.toFixed(1)})`,
    )
    .join("\n");

  const systemPrompt = `Tu es un moteur de consolidation de mémoire IA. Analyse les faits et liens ci-dessous pour un utilisateur.
Identifie :
1. Les faits dupliqués (même clé ou même sens) → garde un, fusionne la valeur.
2. Les contradictions (deux faits opposés sur la même clé) → résous en gardant le plus récent/pertinent.
3. Les liens dupliqués (même source+target+relation) → garde un.
4. Génère un résumé condensé (max 300 mots) du profil sémantique de cet utilisateur.

Réponds UNIQUEMENT en JSON valide :
{
  "duplicates": [{"keepId": "id", "removeIds": ["id1","id2"], "mergedValue": "valeur fusionnée"}],
  "contradictions": [{"winningId": "id", "losingIds": ["id1"], "resolvedValue": "valeur résolue"}],
  "updatedSummary": "résumé condensé du profil",
  "linksToMerge": [{"keepId": "id", "removeIds": ["id1"]}]
}`;

  const userPrompt = `Faits actuels (${facts.length}) :
${factsText || "  (aucun)"}

Liens actuels (${links.length}) :
${linksText || "  (aucun)"}

Résumé actuel : ${currentSummary || "(aucun)"}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - Memory Grooming",
      },
      body: JSON.stringify({
        model: GROOMING_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt.slice(0, 8000) },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      logger.warn(`[MemoryGrooming] LLM HTTP ${response.status} for user ${userId}`);
      return null;
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as ConsolidationPlan;
  } catch (err) {
    logger.error(
      `[MemoryGrooming] LLM error for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Applique le plan de consolidation en base.
 */
async function applyConsolidation(
  userId: string,
  plan: ConsolidationPlan,
): Promise<{ factsRemoved: number; linksRemoved: number; summaryUpdated: boolean }> {
  let factsRemoved = 0;
  let linksRemoved = 0;
  let summaryUpdated = false;

  // Supprimer les faits dupliqués et mettre à jour la valeur conservée
  for (const dup of plan.duplicates) {
    try {
      if (dup.removeIds.length > 0) {
        await prisma.memoryFact.deleteMany({
          where: { id: { in: dup.removeIds }, userId },
        });
        factsRemoved += dup.removeIds.length;
      }
      if (dup.mergedValue) {
        await prisma.memoryFact.update({
          where: { id: dup.keepId },
          data: { value: dup.mergedValue.slice(0, 200) },
        });
      }
    } catch {
      // Ignore individual errors
    }
  }

  // Résoudre les contradictions
  for (const contra of plan.contradictions) {
    try {
      if (contra.losingIds.length > 0) {
        await prisma.memoryFact.deleteMany({
          where: { id: { in: contra.losingIds }, userId },
        });
        factsRemoved += contra.losingIds.length;
      }
      if (contra.resolvedValue) {
        await prisma.memoryFact.update({
          where: { id: contra.winningId },
          data: { value: contra.resolvedValue.slice(0, 200) },
        });
      }
    } catch {
      // Ignore
    }
  }

  // Fusionner les liens dupliqués
  for (const linkMerge of plan.linksToMerge) {
    try {
      if (linkMerge.removeIds.length > 0) {
        await prisma.memoryLink.deleteMany({
          where: { id: { in: linkMerge.removeIds }, userId },
        });
        linksRemoved += linkMerge.removeIds.length;
      }
    } catch {
      // Ignore
    }
  }

  // Mettre à jour le résumé
  if (plan.updatedSummary) {
    try {
      await prisma.userMemory.update({
        where: { userId },
        data: { summary: plan.updatedSummary.slice(0, 1000) },
      });
      summaryUpdated = true;
    } catch {
      // Ignore
    }
  }

  return { factsRemoved, linksRemoved, summaryUpdated };
}

/**
 * Traite un utilisateur : récupère faits + liens, consolide, applique.
 */
async function groomUser(userId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [facts, links, userMemory] = await Promise.all([
    prisma.memoryFact.findMany({
      where: { userId, updatedAt: { gte: since } },
      select: { id: true, key: true, value: true, category: true, weight: true },
      orderBy: { weight: "desc" },
      take: MAX_FACTS_PER_USER,
    }),
    prisma.memoryLink.findMany({
      where: { userId, updatedAt: { gte: since } },
      select: { id: true, sourceKey: true, targetKey: true, relation: true, strength: true },
      orderBy: { strength: "desc" },
      take: MAX_LINKS_PER_USER,
    }),
    prisma.userMemory.findUnique({
      where: { userId },
      select: { summary: true },
    }),
  ]);

  if (facts.length === 0 && links.length === 0) return;

  const plan = await consolidateWithLLM(userId, facts, links, userMemory?.summary ?? null);
  if (!plan) return;

  const result = await applyConsolidation(userId, plan);

  logger.info(
    `[MemoryGrooming] user=${userId} — ${result.factsRemoved} faits supprimés, ${result.linksRemoved} liens fusionnés, résumé ${result.summaryUpdated ? "mis à jour" : "inchangé"}`,
  );
}

/**
 * Exécute la consolidation nocturne pour tous les utilisateurs actifs.
 */
export async function runMemoryGrooming(): Promise<void> {
  logger.info("[MemoryGrooming] Démarrage de la consolidation nocturne...");

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const userIds = await getActiveUsers(since);

    if (userIds.length === 0) {
      logger.info("[MemoryGrooming] Aucun utilisateur actif — skip");
      return;
    }

    logger.info(`[MemoryGrooming] ${userIds.length} utilisateur(s) à consolider`);

    const totalFactsRemoved = 0;
    const totalLinksRemoved = 0;
    const totalSummariesUpdated = 0;

    for (const userId of userIds) {
      try {
        await groomUser(userId);
      } catch (err) {
        logger.error(
          `[MemoryGrooming] Erreur user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        Sentry.captureException(err, { tags: { module: "memoryGrooming", userId } });
      }
    }

    logger.info(
      `[MemoryGrooming] Consolidation terminée — ${totalFactsRemoved} faits, ${totalLinksRemoved} liens, ${totalSummariesUpdated} résumés`,
    );
  } catch (err) {
    logger.error(
      `[MemoryGrooming] Erreur fatale: ${err instanceof Error ? err.message : String(err)}`,
    );
    Sentry.captureException(err, { tags: { module: "memoryGrooming" } });
  }
}

/**
 * Démarre le cron de consolidation nocturne.
 */
export function startMemoryGrooming(_client: Client): void {
  if (cronJob) {
    logger.warn("[MemoryGrooming] Déjà actif — ignoré");
    return;
  }

  cronJob = cron.schedule(GROOMING_CRON_EXPRESSION, () => {
    void runMemoryGrooming();
  });

  logger.info("[MemoryGrooming] Cron planifié à 04h05 (après NotificationCleanup)");
}

/**
 * Arrête le cron.
 */
export function stopMemoryGrooming(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[MemoryGrooming] Cron arrêté");
  }
}
