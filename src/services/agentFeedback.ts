/**
 * agentFeedback.ts — Feedback silencieux et indicateur d'activité pour l'agent
 *
 * 1. Statut progressif: message édité à chaque appel d'outil pendant la boucle agent
 * 2. Réactions 👍/👎: ajoutées automatiquement sous chaque réponse agent
 * 3. Écoute messageReactionAdd: enregistre le feedback en base
 */

import { Message, TextChannel, MessageReaction, User, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Statut progressif ────────────────────────────────────────────────────────

const STATUS_EMOJIS = ["🔍", "🌐", "🔧", "📊", "💭", "✨", "🛠️", "📡"];
const STATUS_LABELS = [
  "Analyse de ta demande…",
  "Recherche en cours…",
  "Lecture des résultats…",
  "Traitement des données…",
  "Réflexion…",
  "Synthèse de la réponse…",
  "Finalisation…",
  "Presque prêt…",
];

const MIN_DELAY_BEFORE_STATUS_MS = 1000;

export class AgentStatusIndicator {
  private statusMessage: Message | null = null;
  private channel: TextChannel;
  private startTime: number;
  private toolCallCount: number = 0;
  private isCancelled: boolean = false;

  constructor(channel: TextChannel) {
    this.channel = channel;
    this.startTime = Date.now();
  }

  async onToolCall(toolName: string, _iteration: number): Promise<void> {
    if (this.isCancelled) return;

    const elapsed = Date.now() - this.startTime;
    if (elapsed < MIN_DELAY_BEFORE_STATUS_MS) return;

    this.toolCallCount++;

    const idx = Math.min(this.toolCallCount - 1, STATUS_EMOJIS.length - 1);
    const emoji = STATUS_EMOJIS[idx];
    const label = STATUS_LABELS[idx];

    try {
      if (!this.statusMessage) {
        this.statusMessage = await this.channel.send({
          content: `${emoji} ${label}`,
          allowedMentions: { repliedUser: false },
        });
      } else {
        await this.statusMessage.edit({ content: `${emoji} ${label} *(outil: ${toolName})*` });
      }
    } catch { logger.error("[Silent catch]"); }
  }

  async cleanup(): Promise<void> {
    this.isCancelled = true;
    if (this.statusMessage) {
      try {
        await this.statusMessage.delete();
      } catch { logger.error("[Silent catch]"); }
      this.statusMessage = null;
    }
  }

  get hasStatusMessage(): boolean {
    return this.statusMessage !== null;
  }
}

// ─── Réactions feedback ───────────────────────────────────────────────────────

import { recordFeedback } from "./proactiveAgent.js";

const FEEDBACK_REACTIONS = ["👍", "👎"];

export async function addFeedbackReactions(message: Message): Promise<void> {
  try {
    for (const emoji of FEEDBACK_REACTIONS) {
      await message.react(emoji);
    }
  } catch (err) {
    logger.debug(`[AgentFeedback] Failed to add reactions: ${err}`);
  }
}

export async function handleFeedbackReaction(reaction: MessageReaction, user: User): Promise<void> {
  if (user.bot) return;

  const emoji = reaction.emoji.name;
  if (emoji !== "👍" && emoji !== "👎") return;

  const message = reaction.message;
  if (!message.author || message.author.id !== message.client.user?.id) return;

  const isPositive = emoji === "👍";

  try {
    await prisma.commandLog.create({
      data: {
        command: "agent_feedback",
        userId: user.id,
        guildId: message.guildId || null,
        channelId: message.channelId,
        args: JSON.stringify({
          messageId: message.id,
          feedback: isPositive ? "positive" : "negative",
        }),
        success: true,
      },
    });

    logger.info(`[AgentFeedback] ${isPositive ? "👍" : "👎"} by ${user.tag} on msg ${message.id}`);

    // Feed the proactive agent learning loop
    recordFeedback(user.id, "agent_response", isPositive);
  } catch (err) {
    logger.debug(`[AgentFeedback] Failed to log: ${err}`);
  }
}

// ─── Compteur de conversations pour threads auto ─────────────────────────────

const conversationCounts = new Map<string, { count: number; lastAt: number }>();
const THREAD_SUGGESTION_THRESHOLD = 4;
const CONVERSATION_TIMEOUT_MS = 10 * 60 * 1000;

export function trackConversation(
  userId: string,
  channelId: string,
): { shouldSuggestThread: boolean } {
  const key = `${userId}:${channelId}`;
  const now = Date.now();
  const entry = conversationCounts.get(key);

  if (!entry || now - entry.lastAt > CONVERSATION_TIMEOUT_MS) {
    conversationCounts.set(key, { count: 1, lastAt: now });
    return { shouldSuggestThread: false };
  }

  entry.count++;
  entry.lastAt = now;

  return {
    shouldSuggestThread: entry.count === THREAD_SUGGESTION_THRESHOLD,
  };
}

export function resetConversationTracking(userId: string, channelId: string): void {
  conversationCounts.delete(`${userId}:${channelId}`);
}

export async function suggestThread(message: Message): Promise<void> {
  if (!message.guildId) return;
  if (message.channel.isThread()) return;
  if (message.channel.type === ChannelType.DM) return;

  try {
    const channel = message.channel as TextChannel;
    await channel.send({
      content: `💬 On discute beaucoup ici! Veux-tu continuer dans un fil dédié pour ne pas encombrer le salon? Clique sur le bouton ci-dessous.`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: "Continuer dans un fil",
              customId: `agent_thread_${message.author.id}`,
              emoji: "🧵",
            },
          ],
        },
      ],
    });
  } catch (err) {
    logger.debug(`[AgentFeedback] Failed to suggest thread: ${err}`);
  }
}
