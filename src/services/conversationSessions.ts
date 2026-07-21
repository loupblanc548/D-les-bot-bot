/**
 * conversationSessions.ts — Conversations persistantes multi-sessions
 *
 * Permet à chaque utilisateur d'avoir des conversations nommées,
 * reprises des jours après, avec résumé automatique injecté au prompt.
 *
 * Utilise ChatConversation en DB + un système de sessions en mémoire.
 */

import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";

// ─── Active session tracking (in-memory) ─────────────────────────────────────

interface ActiveSession {
  userId: string;
  sessionName: string;
  startedAt: Date;
  messageCount: number;
}

const activeSessions = new Map<string, ActiveSession>();

// ─── Session management ──────────────────────────────────────────────────────

/**
 * Get the active session for a user, or null if none.
 */
export function getActiveSession(userId: string): ActiveSession | null {
  return activeSessions.get(userId) ?? null;
}

/**
 * Start a new named conversation session.
 */
export function startSession(userId: string, sessionName: string): ActiveSession {
  const session: ActiveSession = {
    userId,
    sessionName,
    startedAt: new Date(),
    messageCount: 0,
  };
  activeSessions.set(userId, session);
  logger.info(`[Sessions] Started "${sessionName}" for ${userId}`);
  return session;
}

/**
 * End the active session for a user.
 */
export function endSession(userId: string): ActiveSession | null {
  const session = activeSessions.get(userId);
  if (!session) return null;
  activeSessions.delete(userId);
  logger.info(
    `[Sessions] Ended "${session.sessionName}" for ${userId} (${session.messageCount} messages)`,
  );
  return session;
}

/**
 * Increment message count for active session.
 */
export function tickSessionMessage(userId: string): void {
  const session = activeSessions.get(userId);
  if (session) session.messageCount++;
}

// ─── Conversation persistence ────────────────────────────────────────────────

/**
 * Save a message to the persistent conversation log.
 */
export async function saveConversationMessage(
  userId: string,
  guildId: string,
  channelId: string,
  role: string,
  content: string,
  model?: string,
  tokens?: number,
): Promise<void> {
  try {
    await prisma.chatConversation.create({
      data: { userId, guildId, channelId, role, content, model, tokens },
    });
    tickSessionMessage(userId);
  } catch (err) {
    logger.debug(`[Sessions] Save failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Generate a summary of an old conversation session for context injection.
 */
export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  if (messages.length === 0) return "";
  if (messages.length < 6)
    return messages.map((m) => `${m.role}: ${m.content.slice(0, 100)}`).join("\n");

  try {
    const client = getOpenAIClient();
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const completion = await client.chat.completions.create({
      model: "meta-llama/llama-3.2-3b-instruct:free",
      messages: [
        {
          role: "system",
          content:
            "Résume cette conversation en 3-5 points clés. Sois concis. Réponds en français.",
        },
        { role: "user", content: conversationText.slice(0, 3000) },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    return messages
      .slice(-4)
      .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
      .join("\n");
  }
}

/**
 * Load recent conversation history for a user+channel and generate a summary
 * if the conversation is old (> 1 hour since last message).
 */
export async function loadConversationContext(userId: string, channelId: string): Promise<string> {
  try {
    const recent = await prisma.chatConversation.findMany({
      where: { userId, channelId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    if (recent.length === 0) return "";

    // Check if last message is recent (< 1h)
    const lastMsg = recent[0];
    const ageMs = Date.now() - lastMsg.createdAt.getTime();
    if (ageMs < 60 * 60 * 1000) {
      // Recent conversation — return raw history
      return recent
        .reverse()
        .map((m) => `${m.role}: ${m.content.slice(0, 150)}`)
        .join("\n");
    }

    // Old conversation — generate summary
    const summary = await summarizeConversation(
      recent.reverse().map((m) => ({ role: m.role, content: m.content })),
    );
    return `[Résumé conversation précédente]: ${summary}`;
  } catch (err) {
    logger.debug(
      `[Sessions] Load context failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return "";
  }
}

// ─── /conversation command handlers ──────────────────────────────────────────

export async function handleConversationNew(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("nom", true);
  const userId = interaction.user.id;

  startSession(userId, name);
  await interaction.reply({
    content: `✅ Nouvelle conversation "**${name}**" démarrée. Je garderai le contexte jusqu'à la fin de la session.`,
    flags: [MessageFlags.Ephemeral],
  });
}

export async function handleConversationList(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const userId = interaction.user.id;
  const sessions = await prisma.chatConversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { channelId: true, createdAt: true, role: true },
  });

  if (sessions.length === 0) {
    await interaction.editReply({ content: "📭 Aucune conversation enregistrée." });
    return;
  }

  // Group by channelId
  const channelMap = new Map<string, { count: number; lastAt: Date }>();
  for (const s of sessions) {
    const existing = channelMap.get(s.channelId);
    if (existing) {
      existing.count++;
      if (s.createdAt > existing.lastAt) existing.lastAt = s.createdAt;
    } else {
      channelMap.set(s.channelId, { count: 1, lastAt: s.createdAt });
    }
  }

  const active = getActiveSession(userId);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("💬 Tes conversations")
    .setDescription(
      active
        ? `Session active: **${active.sessionName}** (${active.messageCount} messages)`
        : "Aucune session active. Utilise `/conversation new` pour en démarrer une.",
    );

  const channels = [...channelMap.entries()]
    .sort((a, b) => b[1].lastAt.getTime() - a[1].lastAt.getTime())
    .slice(0, 10);
  for (const [channelId, info] of channels) {
    embed.addFields({
      name: `#${channelId.slice(0, 20)}`,
      value: `${info.count} messages • Dernier: ${info.lastAt.toLocaleDateString("fr-FR")}`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export async function handleConversationEnd(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const session = endSession(userId);

  if (!session) {
    await interaction.reply({
      content: "❌ Aucune session active à terminer.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.reply({
    content: `✅ Session "**${session.sessionName}**" terminée (${session.messageCount} messages échangés).`,
    flags: [MessageFlags.Ephemeral],
  });
}
