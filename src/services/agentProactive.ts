/**
 * agentProactive.ts — Boucle proactive de l'agent IA
 *
 * Toutes les 30 minutes, l'agent "réfléchit" seul :
 *  1. Analyse l'activité du serveur (messages récents, tendances)
 *  2. Vérifie les deals gaming, news, patchs
 *  3. Détecte les sujets viraux et poste proactivement
 *  4. Surveille la santé du bot et prend des mesures correctives
 *  5. Peut enchaîner plusieurs tools sans intervention humaine
 *
 * Mémoire : garde un historique des actions proactives pour éviter les répétitions.
 */

import type { Client, TextChannel } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import prisma from "../prisma.js";
import { getGoogleTrends, getEarthquakes } from "./freeApis.js";
import { recordDecision, getRecentDecisions } from "./agentDecisionMemory.js";

const PROACTIVE_CHANNEL = process.env.PROACTIVE_CHANNEL_ID ?? config.logChannel;
const REFLECTION_INTERVAL = process.env.PROACTIVE_INTERVAL ?? "30";

interface ProactiveContext {
  serverActivity: number;
  recentTopics: string[];
  lastProactiveActions: string[];
  botHealth: "healthy" | "degraded" | "critical";
}

/**
 * Récupère le contexte pour la réflexion proactive.
 */
async function gatherContext(client: Client): Promise<ProactiveContext> {
  let serverActivity = 0;
  let recentTopics: string[] = [];

  try {
    const since = new Date(Date.now() - 30 * 60 * 1000);
    const recentLogs = await prisma.log.findMany({
      where: { createdAt: { gte: since } },
      take: 100,
      orderBy: { createdAt: "desc" },
    }).catch(() => []);
    serverActivity = recentLogs.length;

    const wordCounts = new Map<string, number>();
    for (const log of recentLogs) {
      const words = (log.action ?? "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
      for (const w of words) {
        wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
      }
    }
    recentTopics = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  } catch {
    // Non-critique
  }

  const recentDecisions = await getRecentDecisions("proactive", 5);
  const lastProactiveActions = recentDecisions.map((d: { action: string }) => d.action);

  // Santé du bot
  const memUsage = process.memoryUsage();
  const memMB = memUsage.rss / 1024 / 1024;
  const botHealth: "healthy" | "degraded" | "critical" =
    memMB > 1500 ? "critical" : memMB > 800 ? "degraded" : "healthy";

  return { serverActivity, recentTopics, lastProactiveActions, botHealth };
}

/**
 * L'agent réfléchit et décide d'actions proactives.
 */
async function proactiveThink(client: Client): Promise<void> {
  if (config.autonomousAgentMode === "off") return;

  logger.info("[Proactive] 🧠 Cycle de réflexion proactive démarré");

  const ctx = await gatherContext(client);

  const channel = await client.channels.fetch(PROACTIVE_CHANNEL ?? "").catch(() => null);
  if (!channel?.isTextBased()) {
    logger.warn("[Proactive] Canal proactive introuvable");
    return;
  }

  const actions: string[] = [];

  // 1. Auto-GC si RAM élevée
  if (ctx.botHealth !== "healthy" && global.gc) {
    const memMB = process.memoryUsage().rss / 1024 / 1024;
    global.gc();
    actions.push(`🧹 GC manuel déclenché (RAM: ${memMB.toFixed(0)}MB)`);
    await recordDecision({ type: "proactive", action: "auto_gc", success: true, context: `${memMB.toFixed(0)}MB` });
  }

  // 2. Google Trends
  try {
    const trends = await getGoogleTrends("FR");
    if (trends.length > 0) {
      const alreadyPosted = await wasRecentAction("trends", trends[0].title.slice(0, 20), 120);
      if (!alreadyPosted) {
        const top5 = trends.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join("\n");
        actions.push(`📈 **Tendances Google FR**\n${top5}`);
        await recordDecision({ type: "trends", action: trends[0].title.slice(0, 50), success: true, context: "auto" });
      }
    }
  } catch { /* non-critique */ }

  // 3. Séismes
  try {
    const quakes = await getEarthquakes(5.0, 3);
    if (quakes.length > 0) {
      const alreadyPosted = await wasRecentAction("earthquake", quakes[0].place, 120);
      if (!alreadyPosted) {
        const formatted = quakes.map((q) => `M${q.magnitude} — ${q.place}`).join("\n");
        actions.push(`🌍 **Séismes récents (M≥5.0)**\n${formatted}`);
        await recordDecision({ type: "earthquake", action: quakes[0].place, success: true, context: "auto" });
      }
    }
  } catch { /* non-critique */ }

  // 4. Si activité faible et rien à dire
  if (ctx.serverActivity < 5 && actions.length === 0) {
    actions.push("💤 Activité faible — le serveur est calme. RAS pour l'instant.");
  }

  // Poster les actions
  if (actions.length > 0) {
    const timestamp = new Date().toLocaleTimeString("fr-FR");
    const content = `🧠 **Réflexion proactive** — ${timestamp}\n\n${actions.join("\n\n")}`;
    await (channel as TextChannel).send({ content: content.slice(0, 1900) }).catch(() => {});
    await recordDecision({ type: "proactive", action: `reflect_${actions.length}_actions`, success: true, context: JSON.stringify(ctx) });
    logger.info(`[Proactive] ✅ ${actions.length} actions proactives postées`);
  } else {
    logger.info("[Proactive] RAS — aucune action proactive nécessaire");
  }
}

async function wasRecentAction(type: string, substring: string, withinMinutes: number): Promise<boolean> {
  const recent = await getRecentDecisions(type, 10);
  const cutoff = Date.now() - withinMinutes * 60 * 1000;
  return recent.some(
    (d) => d.createdAt && new Date(d.createdAt).getTime() > cutoff && d.action.toLowerCase().includes(substring.toLowerCase()),
  );
}

/**
 * Construit le prompt de réflexion proactive.
 */
function buildReflectionPrompt(ctx: ProactiveContext): string {
  const parts: string[] = [
    "Tu es en mode réflexion proactive. Personne ne t'a parlé, tu dois analyser la situation et décider d'actions autonomes.",
    "",
    `## Contexte serveur`,
    `- Activité (30 dernières min): ${ctx.serverActivity} messages`,
    `- Sujets chauds: ${ctx.recentTopics.join(", ") || "Aucun"}`,
    `- Santé bot: ${ctx.botHealth} (RAM: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)}MB)`,
    `- Actions proactives récentes (ne pas répéter): ${ctx.lastProactiveActions.join(" | ") || "Aucune"}`,
    "",
    "## Actions possibles (utilise les tools disponibles):",
    "1. Si activité faible → poste un contenu intéressant (devto, google trends, joke, quote)",
    "2. Si RAM > 1GB → appelle triggerGarbageCollection",
    "3. Si sujets chauds détectés → résume et poste une analyse",
    "4. Vérifie les deals gaming (getSteamGame, searchWeb 'deals')",
    "5. Vérifie les séismes récents (get_earthquakes)",
    "6. Vérifie les tendances Google (get_google_trends)",
    "7. Si rien d'urgent → poste un fait intéressant ou une citation",
    "",
    "SOIS CONCIS. Si rien d'intéressant à dire, réponds juste 'RAS'.",
  ];

  return parts.join("\n");
}

/**
 * Surveillance autonome — vérifie des sources externes en parallèle.
 */
async function autonomousMonitor(client: Client): Promise<void> {
  if (config.autonomousAgentMode === "off") return;

  const channel = await client.channels.fetch(PROACTIVE_CHANNEL ?? "").catch(() => null);
  if (!channel?.isTextBased()) return;

  // 1. Google Trends
  try {
    const trends = await getGoogleTrends("FR");
    if (trends.length > 0) {
      const top3 = trends.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`).join("\n");
      const recentDecisions = await getRecentDecisions("trends", 1);
      if (recentDecisions.length === 0 || recentDecisions[0].action !== top3.slice(0, 50)) {
        await (channel as TextChannel).send({
          content: `📈 **Tendances Google FR** — ${new Date().toLocaleTimeString("fr-FR")}\n${top3}`,
        }).catch(() => {});
        await recordDecision({ type: "trends", action: top3.slice(0, 50), success: true, context: "auto" });
      }
    }
  } catch { /* non-critique */ }

  // 2. Séismes (magnitude > 5)
  try {
    const quakes = await getEarthquakes(5.0, 3);
    if (quakes.length > 0) {
      const recentDecisions = await getRecentDecisions("earthquake", 1);
      const quakeKey = quakes[0]?.place ?? "";
      if (recentDecisions.length === 0 || !recentDecisions[0].action.includes(quakeKey)) {
        const formatted = quakes.map((q) => `M${q.magnitude} — ${q.place}`).join("\n");
        await (channel as TextChannel).send({
          content: `🌍 **Séismes récents (M≥5.0)**\n${formatted}`,
        }).catch(() => {});
        await recordDecision({ type: "earthquake", action: quakeKey, success: true, context: "auto" });
      }
    }
  } catch { /* non-critique */ }

  // 3. Auto-GC si RAM élevée
  const memMB = process.memoryUsage().rss / 1024 / 1024;
  if (memMB > 1000) {
    logger.info(`[Proactive] 🧹 RAM élevée (${memMB.toFixed(0)}MB) — déclenchement GC`);
    if (global.gc) {
      global.gc();
      logger.info("[Proactive] ✅ GC manuel exécuté");
    }
    await recordDecision({ type: "gc", action: `auto_gc_${memMB.toFixed(0)}mb`, success: true, context: "auto" });
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let proactiveCron: ScheduledTask | null = null;
let monitorCron: ScheduledTask | null = null;

export function startProactiveAgent(client: Client): void {
  if (config.autonomousAgentMode === "off") {
    logger.info("[Proactive] Mode autonome OFF — agent proactive désactivé");
    return;
  }

  const interval = parseInt(REFLECTION_INTERVAL, 10) || 30;
  // Cron expression: every N minutes
  const cronExpr = `*/${interval} * * * *`;

  proactiveCron = cron.schedule(cronExpr, () => {
    proactiveThink(client).catch((err) =>
      logger.error(`[Proactive] Erreur cycle: ${err instanceof Error ? err.message : String(err)}`),
    );
  });

  // Monitoring plus fréquent (toutes les 10 min)
  monitorCron = cron.schedule("*/10 * * * *", () => {
    autonomousMonitor(client).catch((err) =>
      logger.error(`[Proactive] Erreur monitor: ${err instanceof Error ? err.message : String(err)}`),
    );
  });

  logger.info(
    `[Proactive] 🧠 Agent proactive activé — réflexion toutes les ${interval}min, monitoring toutes les 10min`,
  );
}

export function stopProactiveAgent(): void {
  proactiveCron?.stop();
  monitorCron?.stop();
  proactiveCron = null;
  monitorCron = null;
}
