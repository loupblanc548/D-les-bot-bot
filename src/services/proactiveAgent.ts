/**
 * proactiveAgent.ts — Proactivité, apprentissage feedback, digest perso
 *
 * 1. Détecte les questions qui restent sans réponse dans un salon
 * 2. Adapte les prompts système selon les réactions feedback (👍/👎)
 * 3. Génère un digest hebdomadaire personnalisé par utilisateur
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";

// ─── 1. Unanswered question detection ────────────────────────────────────────

interface UnansweredQuestion {
  channelId: string;
  messageId: string;
  authorId: string;
  content: string;
  timestamp: Date;
}

const QUESTION_PATTERNS = [
  /\?$/,
  /\b(comment|pourquoi|quand|où|comment faire|help|aide|quelqu'un sait|est-ce que)\b/i,
  /\b(how|why|when|where|what|can someone|anyone know|is there)\b/i,
];

/**
 * Scanne les messages récents d'un salon et détecte les questions sans réponse.
 * Ne se déclenche que si le bot n'a pas déjà répondu dans les 5 minutes.
 */
export async function detectUnansweredQuestions(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<UnansweredQuestion[]> {
  try {
    const channel = await client.channels.fetch(channelId).catch((): null => null);
    if (!channel || !channel.isTextBased()) return [];

    const messages = await channel.messages.fetch({ limit: 30 });
    const now = Date.now();
    const unanswered: UnansweredQuestion[] = [];

    for (const [id, msg] of messages) {
      // Skip bot messages
      if (msg.author.bot) continue;
      // Skip messages older than 10 minutes
      if (now - msg.createdTimestamp > 10 * 60 * 1000) continue;

      // Check if it looks like a question
      const isQuestion = QUESTION_PATTERNS.some((p) => p.test(msg.content));
      if (!isQuestion) continue;

      // Check if the bot or another user replied within 5 minutes
      const replies = messages.filter(
        (m) =>
          m.createdTimestamp > msg.createdTimestamp &&
          m.createdTimestamp - msg.createdTimestamp < 5 * 60 * 1000 &&
          (m.author.bot || m.mentions?.has(msg.author.id)),
      );

      if (replies.size === 0) {
        unanswered.push({
          channelId,
          messageId: id,
          authorId: msg.author.id,
          content: msg.content.slice(0, 200),
          timestamp: new Date(msg.createdTimestamp),
        });
      }
    }

    return unanswered;
  } catch (err) {
    logger.debug(
      `[Proactive] detectUnansweredQuestions: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Tente de répondre proactivement à une question non répondue.
 */
export async function tryProactiveReply(
  client: Client,
  question: UnansweredQuestion,
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(question.channelId).catch((): null => null);
    if (!channel || !("send" in channel)) return false;

    // Generate a brief helpful response
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant Discord proactif. Un utilisateur a posé une question qui est restée sans réponse. " +
            "Propose une réponse brève et utile. Si tu n'es pas sûr, dis-le. Réponds en français.",
        },
        { role: "user", content: question.content },
      ],
      max_tokens: 300,
      temperature: 0.5,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) return false;

    await (channel as TextChannel).send({
      content: `💡 <@${question.authorId}>, je viens de voir ta question qui est restée sans réponse. Voici ce que je peux suggérer:\n\n${reply}`,
      allowedMentions: { users: [question.authorId] },
    });

    logger.info(
      `[Proactive] Réponse proactive envoyée pour ${question.authorId} dans ${question.channelId}`,
    );
    return true;
  } catch (err) {
    logger.debug(
      `[Proactive] tryProactiveReply: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

// ─── 2. Feedback-based prompt adaptation ─────────────────────────────────────

interface FeedbackEntry {
  userId: string;
  toolName: string;
  positive: boolean;
  timestamp: Date;
}

const feedbackStore: FeedbackEntry[] = [];
const MAX_FEEDBACK_ENTRIES = 500;

export function recordFeedback(userId: string, toolName: string, positive: boolean): void {
  feedbackStore.push({ userId, toolName, positive, timestamp: new Date() });
  if (feedbackStore.length > MAX_FEEDBACK_ENTRIES) {
    feedbackStore.shift();
  }
  logger.info(`[Feedback] ${positive ? "👍" : "👎"} user=${userId} tool=${toolName}`);
}

/**
 * Génère des hints de prompt basés sur le feedback accumulé.
 * Les outils avec beaucoup de 👎 sont marqués comme "à utiliser avec prudence".
 */
export function getFeedbackHints(userId: string): string {
  const userFeedback = feedbackStore.filter((f) => f.userId === userId);
  if (userFeedback.length === 0) return "";

  const toolStats = new Map<string, { positive: number; negative: number }>();
  for (const f of userFeedback) {
    const stats = toolStats.get(f.toolName) ?? { positive: 0, negative: 0 };
    if (f.positive) stats.positive++;
    else stats.negative++;
    toolStats.set(f.toolName, stats);
  }

  const hints: string[] = [];
  for (const [tool, stats] of toolStats) {
    const total = stats.positive + stats.negative;
    if (total < 2) continue;
    const ratio = stats.positive / total;
    if (ratio < 0.3 && stats.negative >= 2) {
      hints.push(
        `L'utilisateur n'a pas apprécié les résultats de "${tool}" récemment — envisage d'autres approches.`,
      );
    } else if (ratio > 0.8 && stats.positive >= 3) {
      hints.push(`L'utilisateur apprécie particulièrement les résultats de "${tool}".`);
    }
  }

  return hints.length > 0 ? `\n\n[Hints feedback]: ${hints.join(" ")}` : "";
}

// ─── 3. Personal weekly digest ───────────────────────────────────────────────

interface UserDigestData {
  userId: string;
  messageCount: number;
  topChannels: string[];
  topToolsUsed: string[];
  questionsAsked: number;
  helpfulReactions: number;
}

/**
 * Collecte les données d'activité d'un utilisateur pour la semaine écoulée.
 */
async function collectUserDigestData(userId: string): Promise<UserDigestData | null> {
  try {
    const since = new Date(Date.now() - 7 * 86400_000);

    const messages = await prisma.chatHistory.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    if (messages.length === 0) return null;

    // Top channels
    const channelCounts = new Map<string, number>();
    for (const m of messages) {
      channelCounts.set(m.channelId, (channelCounts.get(m.channelId) ?? 0) + 1);
    }
    const topChannels = [...channelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);

    // Count questions
    const questionsAsked = messages.filter((m) =>
      QUESTION_PATTERNS.some((p) => p.test(m.content)),
    ).length;

    // Feedback reactions
    const userFeedback = feedbackStore.filter((f) => f.userId === userId && f.timestamp >= since);
    const helpfulReactions = userFeedback.filter((f) => f.positive).length;

    // Tools used (from feedback)
    const topToolsUsed = [...new Set(userFeedback.map((f) => f.toolName))].slice(0, 5);

    return {
      userId,
      messageCount: messages.length,
      topChannels,
      topToolsUsed,
      questionsAsked,
      helpfulReactions,
    };
  } catch (err) {
    logger.debug(
      `[Digest] collectUserDigestData: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Génère et envoie un digest hebdomadaire à un utilisateur en DM.
 */
export async function sendPersonalDigest(client: Client, userId: string): Promise<boolean> {
  try {
    const data = await collectUserDigestData(userId);
    if (!data || data.messageCount < 5) return false;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📊 Ton digest hebdomadaire")
      .setDescription("Voici un récapitulatif de ton activité cette semaine")
      .addFields(
        { name: "💬 Messages envoyés", value: String(data.messageCount), inline: true },
        { name: "❓ Questions posées", value: String(data.questionsAsked), inline: true },
        { name: "👍 Réactions positives", value: String(data.helpfulReactions), inline: true },
      )
      .setTimestamp();

    if (data.topToolsUsed.length > 0) {
      embed.addFields({
        name: "🔧 Outils utilisés",
        value: data.topToolsUsed.join(", "),
        inline: false,
      });
    }

    const dm = await client.users.send(userId, { embeds: [embed] }).catch((): null => null);
    if (!dm) return false;

    logger.info(`[Digest] Digest hebdomadaire envoyé à ${userId}`);
    return true;
  } catch (err) {
    logger.debug(
      `[Digest] sendPersonalDigest: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Planificateur de digest hebdomadaire — envoie les digests le dimanche à 10h.
 */
let digestInterval: NodeJS.Timeout | null = null;

export function startPersonalDigestScheduler(client: Client): void {
  if (digestInterval) return;

  // Check every hour
  digestInterval = setInterval(
    async () => {
      const now = new Date();
      // Sunday = 0, between 10:00 and 10:59
      if (now.getDay() !== 0 || now.getHours() !== 10) return;

      logger.info("[Digest] Lancement du digest hebdomadaire personnel");

      // Get active users from the last week
      const since = new Date(Date.now() - 7 * 86400_000);
      const activeUsers = await prisma.chatHistory.findMany({
        where: { createdAt: { gte: since }, userId: { not: null } },
        select: { userId: true },
        distinct: ["userId"],
      });

      for (const { userId } of activeUsers) {
        if (!userId) continue;
        await sendPersonalDigest(client, userId);
        // Stagger sends to avoid rate limits
        await new Promise((r) => setTimeout(r, 2000));
      }

      logger.info(`[Digest] Digest hebdomadaire terminé (${activeUsers.length} utilisateurs)`);
    },
    60 * 60 * 1000,
  ); // Check hourly

  logger.info("[Digest] Planificateur de digest hebdomadaire démarré");
}

export function stopPersonalDigestScheduler(): void {
  if (digestInterval) {
    clearInterval(digestInterval);
    digestInterval = null;
    logger.info("[Digest] Planificateur de digest arrêté");
  }
}
