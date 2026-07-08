/**
 * suggestionSystem.ts — Suggestion system with vote + status flow
 *
 * Users submit suggestions → community votes up/down → staff updates status
 * (pending → approved/denied/implemented). Auto-thread for discussion.
 */

import {
  Guild,
  TextChannel,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ThreadChannel,
  Client,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export type SuggestionStatus = "pending" | "approved" | "denied" | "implemented";

export interface Suggestion {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  upvotes: string[];
  downvotes: string[];
  threadId?: string;
  createdAt: Date;
  decidedBy?: string;
  decidedAt?: Date;
}

const suggestions = new Map<string, Suggestion>();

export interface SuggestionConfig {
  channelId?: string;
  threadAuto: boolean;
  upvoteEmoji: string;
  downvoteEmoji: string;
}

const DEFAULT_CONFIG: SuggestionConfig = {
  threadAuto: true,
  upvoteEmoji: "✅",
  downvoteEmoji: "❌",
};

const configs = new Map<string, SuggestionConfig>();

export async function getSuggestionConfig(guildId: string): Promise<SuggestionConfig> {
  const cached = configs.get(guildId);
  if (cached) return cached;
  try {
    const record = await prisma.guildConfig.findUnique({ where: { guildId } }).catch(() => null);
    if (record?.suggestionConfig) {
      const parsed = { ...DEFAULT_CONFIG, ...(JSON.parse(record.suggestionConfig as string) as Partial<SuggestionConfig>) };
      configs.set(guildId, parsed);
      return parsed;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

export async function setSuggestionConfig(guildId: string, config: Partial<SuggestionConfig>): Promise<void> {
  try {
    const current = await getSuggestionConfig(guildId);
    const merged = { ...current, ...config };
    configs.set(guildId, merged);
    await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId, suggestionConfig: JSON.stringify(merged) },
      update: { suggestionConfig: JSON.stringify(merged) },
    }).catch(() => {});
  } catch (error) {
    logger.error("[Suggestion] setSuggestionConfig:", String(error));
  }
}

// ─── Create suggestion ────────────────────────────────────────────────

export async function createSuggestion(
  guild: Guild,
  authorId: string,
  title: string,
  description: string,
): Promise<Suggestion | null> {
  const config = await getSuggestionConfig(guild.id);
  if (!config.channelId) return null;

  const channel = guild.channels.cache.get(config.channelId) as TextChannel | undefined;
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const id = `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const embed = new EmbedBuilder()
    .setTitle(`💡 Suggestion: ${title}`)
    .setColor(0xf39c12)
    .setDescription(description.slice(0, 4096))
    .addFields(
      { name: "👤 Par", value: `<@${authorId}>`, inline: true },
      { name: "📊 Status", value: "⏳ En attente", inline: true },
      { name: " Votes", value: `${config.upvoteEmoji}: 0 | ${config.downvoteEmoji}: 0`, inline: true },
    )
    .setFooter({ text: `ID: ${id}` })
    .setTimestamp();

  const upvoteBtn = new ButtonBuilder()
    .setCustomId(`sug_up_${id}`)
    .setLabel("Oui")
    .setEmoji(config.upvoteEmoji)
    .setStyle(ButtonStyle.Success);
  const downvoteBtn = new ButtonBuilder()
    .setCustomId(`sug_down_${id}`)
    .setLabel("Non")
    .setEmoji(config.downvoteEmoji)
    .setStyle(ButtonStyle.Danger);
  const approveBtn = new ButtonBuilder()
    .setCustomId(`sug_approve_${id}`)
    .setLabel("Approuver")
    .setStyle(ButtonStyle.Secondary);
  const denyBtn = new ButtonBuilder()
    .setCustomId(`sug_deny_${id}`)
    .setLabel("Rejeter")
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(upvoteBtn, downvoteBtn);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(approveBtn, denyBtn);

  const message = await channel.send({ embeds: [embed], components: [row1, row2] });

  const suggestion: Suggestion = {
    id,
    guildId: guild.id,
    channelId: config.channelId,
    messageId: message.id,
    authorId,
    title,
    description,
    status: "pending",
    upvotes: [],
    downvotes: [],
    createdAt: new Date(),
  };

  // Auto-thread
  if (config.threadAuto) {
    const thread = await message.startThread({
      name: `discussion-${title.slice(0, 40)}`,
      autoArchiveDuration: 1440,
    }).catch(() => null);
    if (thread) {
      suggestion.threadId = thread.id;
    }
  }

  suggestions.set(id, suggestion);
  logger.info(`[Suggestion] Created ${id} by ${authorId}: ${title}`);
  return suggestion;
}

// ─── Vote ─────────────────────────────────────────────────────────────

export function vote(suggestionId: string, userId: string, voteType: "up" | "down"): { success: boolean; message: string } {
  const suggestion = suggestions.get(suggestionId);
  if (!suggestion) return { success: false, message: "Suggestion introuvable." };
  if (suggestion.status !== "pending") return { success: false, message: "Suggestion déjà traitée." };

  // Remove previous vote
  suggestion.upvotes = suggestion.upvotes.filter((u) => u !== userId);
  suggestion.downvotes = suggestion.downvotes.filter((u) => u !== userId);

  if (voteType === "up") {
    suggestion.upvotes.push(userId);
  } else {
    suggestion.downvotes.push(userId);
  }

  return { success: true, message: "Vote enregistré!" };
}

// ─── Update status ────────────────────────────────────────────────────

export async function updateStatus(
  client: Client,
  suggestionId: string,
  status: SuggestionStatus,
  decidedBy: string,
): Promise<Suggestion | null> {
  const suggestion = suggestions.get(suggestionId);
  if (!suggestion) return null;

  suggestion.status = status;
  suggestion.decidedBy = decidedBy;
  suggestion.decidedAt = new Date();

  const guild = client.guilds.cache.get(suggestion.guildId);
  if (guild) {
    const channel = guild.channels.cache.get(suggestion.channelId) as TextChannel | undefined;
    if (channel && channel.type === ChannelType.GuildText) {
      const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
      if (message) {
        const config = await getSuggestionConfig(suggestion.guildId);
        const statusEmoji = status === "approved" ? "✅" : status === "denied" ? "❌" : status === "implemented" ? "🎉" : "⏳";
        const statusText = status === "approved" ? "Approuvée" : status === "denied" ? "Rejetée" : status === "implemented" ? "Implémentée" : "En attente";
        const colors: Record<SuggestionStatus, number> = { pending: 0xf39c12, approved: 0x2ecc71, denied: 0xe74c3c, implemented: 0x9b59b6 };

        const embed = new EmbedBuilder()
          .setTitle(`💡 Suggestion: ${suggestion.title}`)
          .setColor(colors[status])
          .setDescription(suggestion.description.slice(0, 4096))
          .addFields(
            { name: "👤 Par", value: `<@${suggestion.authorId}>`, inline: true },
            { name: "📊 Status", value: `${statusEmoji} ${statusText}`, inline: true },
            { name: " Votes", value: `${config.upvoteEmoji}: ${suggestion.upvotes.length} | ${config.downvoteEmoji}: ${suggestion.downvotes.length}`, inline: true },
            { name: "🔨 Décidé par", value: `<@${decidedBy}>`, inline: false },
          )
          .setFooter({ text: `ID: ${suggestion.id}` })
          .setTimestamp();

        // Remove vote buttons if decided
        if (status === "approved" || status === "denied" || status === "implemented") {
          await message.edit({ embeds: [embed], components: [] });
        } else {
          await message.edit({ embeds: [embed] });
        }
      }
    }
  }

  logger.info(`[Suggestion] ${suggestionId} status → ${status} by ${decidedBy}`);
  return suggestion;
}

// ─── List & stats ─────────────────────────────────────────────────────

export function listSuggestions(guildId: string, status?: SuggestionStatus): Suggestion[] {
  const all = Array.from(suggestions.values()).filter((s) => s.guildId === guildId);
  if (status) return all.filter((s) => s.status === status);
  return all;
}

export function getSuggestionStats(guildId: string): { total: number; pending: number; approved: number; denied: number; implemented: number } {
  const all = listSuggestions(guildId);
  return {
    total: all.length,
    pending: all.filter((s) => s.status === "pending").length,
    approved: all.filter((s) => s.status === "approved").length,
    denied: all.filter((s) => s.status === "denied").length,
    implemented: all.filter((s) => s.status === "implemented").length,
  };
}

export function getSuggestion(id: string): Suggestion | null {
  return suggestions.get(id) ?? null;
}
