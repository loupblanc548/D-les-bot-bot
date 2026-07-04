/**
 * agentBrain.ts — Cerveau de l'Agent IA Autonome
 *
 * Deux rôles :
 *  1. Scanner de messages proactif — analyse en temps réel les messages
 *     suspects (toxicité, spam, phishing) et prend des décisions sans
 *     attendre que le risk score monte.
 *  2. Auto-résolution d'alertes — examine les alertes PENDING en attente
 *     et peut les résoudre automatiquement si l'IA est confiante.
 *
 * Le cerveau utilise le même LLM que l'investigator mais avec un prompt
 * plus court et plus rapide pour les décisions en temps réel.
 */

import { Client, Message, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { getOpenAIClient } from "./ai.js";
import { getOrCreateRiskProfile, recordSecurityEvent, recordSanction } from "./risk-engine.js";
import { getPendingAlerts, resolveAlert, type AlertAction } from "./alert-service.js";
import { createLog } from "./logs.js";
import { sendProactiveAlert } from "./proactiveAlerts.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MessageAnalysis {
  threat: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  action: AlertAction;
  confidence: number;
  reasoning: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

// Messages courts ignorés (pas besoin d'analyse)
const MIN_LENGTH_FOR_ANALYSIS = 15;

// Cooldown par utilisateur pour l'analyse IA (évite de spammer l'API)
const ANALYSIS_COOLDOWN_MS = 30 * 1000; // 30s
const recentAnalyses = new Map<string, number>();

// Cooldown pour l'auto-résolution d'alertes
const ALERT_REVIEW_COOLDOWN_MS = 5 * 60 * 1000; // 5 min
let lastAlertReview = 0;

// ─── 1. Scanner de messages proactif ─────────────────────────────────────────

/**
 * Analyse un message en temps réel avec l'IA pour détecter les menaces.
 * Retourne null si le message n'a pas besoin d'analyse.
 */
async function analyzeMessage(message: Message): Promise<MessageAnalysis | null> {
  // Skip: bots, messages trop courts, messages système
  if (message.author.bot) return null;
  if (message.content.length < MIN_LENGTH_FOR_ANALYSIS) return null;
  if (!message.guild) return null;

  // Skip: modérateurs et admins
  const member = message.member;
  if (member?.permissions.has("Administrator" as never)) return null;

  // Cooldown check
  const cooldownKey = `${message.author.id}:${message.guild.id}`;
  const lastAnalysis = recentAnalyses.get(cooldownKey);
  if (lastAnalysis && Date.now() - lastAnalysis < ANALYSIS_COOLDOWN_MS) return null;

  recentAnalyses.set(cooldownKey, Date.now());

  try {
    const client = getOpenAIClient();

    // Récupérer l'historique récent du salon (5 derniers messages pour le contexte)
    const recentMessages = await message.channel.messages.fetch({ limit: 5 }).catch(() => null);
    const context = recentMessages
      ? recentMessages
          .filter((m) => !m.author.bot)
          .map((m) => `${m.author.username}: ${m.content.slice(0, 200)}`)
          .reverse()
          .join("\n")
      : "";

    const prompt =
      `Tu es un agent de modération autonome en temps réel sur Discord. ` +
      `Analyse le message suivant et détermine s'il nécessite une action.\n\n` +
      `## Contexte (messages récents)\n${context}\n\n` +
      `## Message à analyser\n${message.author.username}: ${message.content.slice(0, 500)}\n\n` +
      `## Critères de menace\n` +
      `- NONE: message normal, aucune menace\n` +
      `- LOW: légèrement borderline mais pas d'action nécessaire\n` +
      `- MEDIUM: comportement inapproprié, warn justifié\n` +
      `- HIGH: spam massif, harcèlement, phishing probable — timeout ou kick\n` +
      `- CRITICAL: menace grave (raid, pédophilie, doxxing) — ban immédiat\n\n` +
      `Réponds UNIQUEMENT en JSON : ` +
      `{"threat": "NONE|LOW|MEDIUM|HIGH|CRITICAL", "action": "IGNORE|WATCH|WARN|TIMEOUT|KICK|BAN", "confidence": <0-100>, "reasoning": "<justification courte en français>"}`;

    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        {
          role: "system",
          content: "Tu réponds uniquement en JSON valide. Sois rapide et décisif.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<MessageAnalysis>;
    const validActions: AlertAction[] = ["IGNORE", "WATCH", "WARN", "TIMEOUT", "KICK", "BAN"];

    if (!parsed.action || !validActions.includes(parsed.action)) return null;

    return {
      threat: parsed.threat || "NONE",
      action: parsed.action,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence || 50))),
      reasoning: parsed.reasoning || "Analyse automatique",
    };
  } catch (error) {
    logger.warn(
      `[AgentBrain] Analyse message échouée: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Handler à appeler dans messageCreate. Analyse le message et prend
 * des décisions autonomes si le mode autonomous est activé.
 */
export async function handleAgentMessageScan(client: Client, message: Message): Promise<void> {
  if (config.autonomousAgentMode === "off") return;
  if (!message.guild) return;
  if (message.author.bot) return;

  const analysis = await analyzeMessage(message);
  if (!analysis) return;

  // Si pas de menace, ne rien faire
  if (analysis.action === "IGNORE" || analysis.threat === "NONE" || analysis.threat === "LOW") {
    return;
  }

  logger.info(
    `[AgentBrain] 🤖 Menace ${analysis.threat} détectée sur ${message.author.tag} — action: ${analysis.action} (${analysis.confidence}%)`,
  );

  // Enregistrer l'événement de sécurité
  try {
    await recordSecurityEvent(message.author.id, message.guild.id, "AI_MODERATION");
  } catch {
    // Non-critique
  }

  // En mode autonomous avec confiance suffisante → exécuter l'action
  if (
    config.autonomousAgentMode === "autonomous" &&
    analysis.confidence >= config.autonomousAgentConfidenceThreshold &&
    analysis.action !== "WATCH"
  ) {
    await executeAgentAction(analysis, message, client);
  } else if (analysis.threat === "HIGH" || analysis.threat === "CRITICAL") {
    // En mode advisory ou confiance insuffisante → alerter seulement
    await sendProactiveAlert(
      `agent_threat_${message.guild.id}`,
      `🤖 Menace ${analysis.threat} détectée`,
      `**Utilisateur:** ${message.author.tag} (<@${message.author.id}>)\n` +
        `**Salon:** ${message.channel.toString()}\n` +
        `**Action recommandée:** ${analysis.action} (${analysis.confidence}% confiance)\n` +
        `**Raison:** ${analysis.reasoning}\n` +
        `**Message:** ${message.content.slice(0, 200)}`,
      analysis.threat === "CRITICAL" ? 0xff3344 : 0xff6600,
      30 * 60 * 1000, // 30 min cooldown
    );
  }
}

/**
 * Exécute une action de modération depuis le scanner de messages.
 */
async function executeAgentAction(
  analysis: MessageAnalysis,
  message: Message,
  client: Client,
): Promise<void> {
  const guild = message.guild;
  if (!guild) return;

  const reason = `[Agent IA] ${analysis.reasoning}`.slice(0, 512);

  try {
    // Récupérer le profil pour l'escalade
    const profile = await getOrCreateRiskProfile(message.author.id, guild.id);

    switch (analysis.action) {
      case "WARN":
        // DM l'utilisateur
        try {
          await message.author.send(`⚠️ **Avertissement automatique** — ${analysis.reasoning}`);
        } catch {
          // DMs fermés
        }
        await prisma.sanction.create({
          data: {
            guildId: guild.id,
            userId: message.author.id,
            moderatorId: "AI_AGENT",
            type: "WARN",
            reason,
          },
        });
        await recordSanction(message.author.id, guild.id, "WARN");
        break;

      case "TIMEOUT": {
        const member = await guild.members.fetch(message.author.id).catch(() => null);
        if (!member) return;
        const duration = Math.min(
          24 * 60 * 60 * 1000,
          (profile.timeoutCount + 1) * 60 * 60 * 1000,
        );
        await member.timeout(duration, reason);
        await recordSanction(message.author.id, guild.id, "TIMEOUT");
        break;
      }

      case "KICK": {
        const member = await guild.members.fetch(message.author.id).catch(() => null);
        if (!member) return;
        await member.kick(reason);
        await recordSanction(message.author.id, guild.id, "KICK");
        break;
      }

      case "BAN":
        await guild.members.ban(message.author.id, {
          reason,
          deleteMessageSeconds: 7 * 86400,
        });
        await recordSanction(message.author.id, guild.id, "BAN");
        break;
    }

    // Supprimer le message incriminé
    await message.delete().catch(() => {});

    await createLog({
      type: `AGENT_BRAIN_${analysis.action}`,
      action: `Agent IA: ${analysis.action} sur ${message.author.tag} (${analysis.confidence}%)`,
      userId: message.author.id,
      moderator: "AI_AGENT",
      details: JSON.stringify({
        action: analysis.action,
        threat: analysis.threat,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        messageId: message.id,
        channelId: message.channelId,
      }),
    });

    logger.info(
      `[AgentBrain] 🤖 Action ${analysis.action} exécutée sur ${message.author.tag} (${analysis.confidence}% — ${analysis.threat})`,
    );
  } catch (error) {
    logger.error(
      `[AgentBrain] Échec exécution ${analysis.action}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── 2. Auto-résolution d'alertes ────────────────────────────────────────────

/**
 * Examine les alertes PENDING et les résout automatiquement avec l'IA.
 * À appeler périodiquement (toutes les 5 min).
 */
export async function autoResolveAlerts(client: Client): Promise<void> {
  if (config.autonomousAgentMode === "off") return;
  if (Date.now() - lastAlertReview < ALERT_REVIEW_COOLDOWN_MS) return;
  lastAlertReview = Date.now();

  try {
    // Récupérer les alertes en attente de toutes les guildes
    // On prend les 10 plus récentes
    const alerts = await prisma.alert.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (alerts.length === 0) return;

    logger.info(`[AgentBrain] 🤖 Examen de ${alerts.length} alertes en attente`);

    for (const alert of alerts) {
      // Skip les alertes de moins de 2 minutes (laisser le temps aux modérateurs humains)
      const ageMs = Date.now() - new Date(alert.createdAt).getTime();
      if (ageMs < 2 * 60 * 1000) continue;

      try {
        const decision = await analyzeAlertWithAI(alert, client);
        if (!decision) continue;

        // En mode autonomous, résoudre si confiance suffisante
        if (
          config.autonomousAgentMode === "autonomous" &&
          decision.confidence >= config.autonomousAgentConfidenceThreshold
        ) {
          await resolveAlert(alert.id, decision.action, "AI_AGENT");

          // Exécuter l'action si nécessaire
          if (decision.action !== "IGNORE" && decision.action !== "WATCH") {
            const guild = client.guilds.cache.get(alert.guildId);
            if (guild) {
              switch (decision.action) {
                case "TIMEOUT": {
                  const member = await guild.members.fetch(alert.userId).catch(() => null);
                  if (member) {
                    await member.timeout(60 * 60 * 1000, `[Agent IA] ${decision.reasoning}`.slice(0, 512));
                    await recordSanction(alert.userId, alert.guildId, "TIMEOUT");
                  }
                  break;
                }
                case "KICK": {
                  const member = await guild.members.fetch(alert.userId).catch(() => null);
                  if (member) {
                    await member.kick(`[Agent IA] ${decision.reasoning}`.slice(0, 512));
                    await recordSanction(alert.userId, alert.guildId, "KICK");
                  }
                  break;
                }
                case "BAN":
                  await guild.members.ban(alert.userId, {
                    reason: `[Agent IA] ${decision.reasoning}`.slice(0, 512),
                    deleteMessageSeconds: 7 * 86400,
                  });
                  await recordSanction(alert.userId, alert.guildId, "BAN");
                  break;
              }
            }
          }

          await createLog({
            type: "AGENT_AUTO_RESOLVE",
            action: `Alerte ${alert.id.slice(0, 8)} auto-résolue: ${decision.action} (${decision.confidence}%)`,
            userId: alert.userId,
            moderator: "AI_AGENT",
            details: JSON.stringify({
              alertId: alert.id,
              action: decision.action,
              confidence: decision.confidence,
              reasoning: decision.reasoning,
            }),
          });

          logger.info(
            `[AgentBrain] 🤖 Alerte ${alert.id.slice(0, 8)} auto-résolue: ${decision.action} (${decision.confidence}%)`,
          );
        }
      } catch (err) {
        logger.warn(
          `[AgentBrain] Erreur auto-résolution alerte ${alert.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (error) {
    logger.error(
      `[AgentBrain] Erreur autoResolveAlerts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Analyse une alerte PENDING avec l'IA pour déterminer l'action.
 */
async function analyzeAlertWithAI(
  alert: { id: string; userId: string; guildId: string; riskScore: number; riskLevel: string; details: string | null; type: string },
  client: Client,
): Promise<{ action: AlertAction; confidence: number; reasoning: string } | null> {
  try {
    const openaiClient = getOpenAIClient();

    // Récupérer le profil de risque
    const profile = await getOrCreateRiskProfile(alert.userId, alert.guildId);

    const prompt =
      `Tu es un agent de modération autonome. Examine cette alerte en attente et décide de l'action.\n\n` +
      `## Alerte\n` +
      `- Type: ${alert.type}\n` +
      `- Score de risque: ${alert.riskScore} (${alert.riskLevel})\n` +
      `- Détails: ${alert.details || "N/A"}\n\n` +
      `## Profil utilisateur\n` +
      `- Sanctions totales: ${profile.totalSanctions} (${profile.warnCount} warns, ${profile.timeoutCount} timeouts, ${profile.kickCount} kicks, ${profile.banCount} bans)\n` +
      `- Sous surveillance: ${profile.underWatch ? "oui" : "non"}\n\n` +
      `Réponds en JSON : {"action": "IGNORE|WATCH|WARN|TIMEOUT|KICK|BAN", "confidence": <0-100>, "reasoning": "<justification courte>"}`;

    const completion = await openaiClient.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        { role: "system", content: "Tu réponds uniquement en JSON valide." },
        { role: "user", content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      action?: string;
      confidence?: number;
      reasoning?: string;
    };

    const validActions: AlertAction[] = ["IGNORE", "WATCH", "WARN", "TIMEOUT", "KICK", "BAN"];
    if (!parsed.action || !validActions.includes(parsed.action as AlertAction)) return null;

    return {
      action: parsed.action as AlertAction,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence || 50))),
      reasoning: parsed.reasoning || "Analyse automatique",
    };
  } catch {
    return null;
  }
}

// ─── 3. Démarrage / arrêt ────────────────────────────────────────────────────

let alertReviewInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Démarre le cerveau de l'agent : scanner de messages + auto-résolution.
 */
export function startAgentBrain(client: Client): void {
  if (config.autonomousAgentMode === "off") {
    logger.info("[AgentBrain] Mode off — agent désactivé");
    return;
  }

  // Auto-résolution d'alertes toutes les 5 minutes
  alertReviewInterval = setInterval(() => {
    void autoResolveAlerts(client).catch((err) =>
      logger.error(`[AgentBrain] Erreur autoResolve: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, ALERT_REVIEW_COOLDOWN_MS);

  // Premier run après 1 minute
  setTimeout(() => void autoResolveAlerts(client), 60 * 1000);

  logger.info(
    `[AgentBrain] 🧠 Cerveau de l'agent démarré (mode: ${config.autonomousAgentMode}, seuil: ${config.autonomousAgentConfidenceThreshold}%)`,
  );
}

export function stopAgentBrain(): void {
  if (alertReviewInterval) {
    clearInterval(alertReviewInterval);
    alertReviewInterval = null;
  }
  logger.info("[AgentBrain] Cerveau de l'agent arrêté");
}
