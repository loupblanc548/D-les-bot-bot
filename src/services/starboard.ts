/**
 * starboard.ts — Star message board
 *
 * Messages that receive enough ⭐ reactions get posted to a starboard channel.
 * Tracks star count and updates the starboard embed as votes change.
 */

import { EmbedBuilder, Guild, TextChannel, ChannelType, Message } from "discord.js";
import logger from "../utils/logger.js";

export interface StarboardEntry {
  messageId: string;
  channelId: string;
  guildId: string;
  authorId: string;
  content: string;
  starCount: number;
  starboardMessageId?: string;
}

const starboardEntries = new Map<string, StarboardEntry>();
const thresholds = new Map<string, number>();

export function setThreshold(guildId: string, threshold: number): void {
  thresholds.set(guildId, threshold);
}

export function getThreshold(guildId: string): number {
  return thresholds.get(guildId) ?? 5;
}

export function getEntry(messageId: string): StarboardEntry | null {
  return starboardEntries.get(messageId) ?? null;
}

export async function handleReaction(
  guild: Guild,
  channelId: string,
  messageId: string,
  emoji: string,
  starboardChannelId: string,
  starCount: number,
): Promise<void> {
  if (emoji !== "⭐") return;

  const threshold = getThreshold(guild.id);
  if (starCount < threshold) {
    // Below threshold — remove from starboard if it was there
    const existing = starboardEntries.get(messageId);
    if (existing?.starboardMessageId) {
      const sbChannel = guild.channels.cache.get(starboardChannelId) as TextChannel | undefined;
      if (sbChannel && sbChannel.type === ChannelType.GuildText) {
        const sbMessage = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
        if (sbMessage) await sbMessage.delete().catch(() => {});
      }
      starboardEntries.delete(messageId);
    }
    return;
  }

  // Fetch the original message
  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  const sbChannel = guild.channels.cache.get(starboardChannelId) as TextChannel | undefined;
  if (!sbChannel || sbChannel.type !== ChannelType.GuildText) return;

  const existing = starboardEntries.get(messageId);

  const embed = buildStarEmbed(message, starCount);

  if (existing && existing.starboardMessageId) {
    // Update existing starboard message
    const sbMessage = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
    if (sbMessage) {
      await sbMessage.edit({ embeds: [embed] }).catch(() => {});
      existing.starCount = starCount;
      return;
    }
  }

  // Create new starboard entry
  const sbMessage = await sbChannel.send({ embeds: [embed] }).catch(() => null);
  if (sbMessage) {
    starboardEntries.set(messageId, {
      messageId,
      channelId,
      guildId: guild.id,
      authorId: message.author.id,
      content: message.content,
      starCount,
      starboardMessageId: sbMessage.id,
    });
    logger.info(`[Starboard] New entry for message ${messageId} with ${starCount} ⭐`);
  }
}

function buildStarEmbed(message: Message, starCount: number): EmbedBuilder {
  const starEmoji = starCount >= 20 ? "🌟" : starCount >= 10 ? "✨" : "⭐";

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`${starEmoji} ${starCount} — Message étoilé`)
    .setDescription(message.content.slice(0, 1024) || "*Message sans contenu*")
    .addFields(
      { name: "👤 Auteur", value: `<@${message.author.id}>`, inline: true },
      { name: "📍 Channel", value: `<#${message.channelId}>`, inline: true },
      { name: "🔗 Lien", value: `[Aller au message](${message.url})`, inline: false },
    )
    .setTimestamp(message.createdAt);

  if (message.author.avatar) {
    embed.setThumbnail(message.author.displayAvatarURL({ size: 128 }));
  }

  if (message.attachments.size > 0) {
    const firstAttachment = message.attachments.first();
    if (firstAttachment && firstAttachment.contentType?.startsWith("image/")) {
      embed.setImage(firstAttachment.url);
    }
  }

  return embed;
}

export function getStarboardStats(guildId: string): { totalEntries: number; totalStars: number; topMessage?: StarboardEntry } {
  const entries = Array.from(starboardEntries.values()).filter((e) => e.guildId === guildId);
  const totalStars = entries.reduce((sum, e) => sum + e.starCount, 0);
  const topMessage = entries.sort((a, b) => b.starCount - a.starCount)[0];
  return { totalEntries: entries.length, totalStars, topMessage };
}
