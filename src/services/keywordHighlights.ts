/**
 * keywordHighlights.ts — Keyword watch & DM notification
 *
 * Users can watch specific keywords. When a keyword is detected in a message,
 * the bot DMs the watching user with the message link and author.
 */

import { Client, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

export interface KeywordWatch {
  userId: string;
  guildId: string;
  keywords: string[];
  createdAt: Date;
}

const watchesByGuild = new Map<string, KeywordWatch[]>();

export function addWatch(userId: string, guildId: string, keywords: string[]): void {
  if (!watchesByGuild.has(guildId)) watchesByGuild.set(guildId, []);
  const guildWatches = watchesByGuild.get(guildId)!;

  // Remove existing watch for this user
  const filtered = guildWatches.filter((w) => w.userId !== userId);
  filtered.push({ userId, guildId, keywords: keywords.map((k) => k.toLowerCase()), createdAt: new Date() });
  watchesByGuild.set(guildId, filtered);
}

export function removeWatch(userId: string, guildId: string): void {
  const guildWatches = watchesByGuild.get(guildId);
  if (!guildWatches) return;
  const filtered = guildWatches.filter((w) => w.userId !== userId);
  watchesByGuild.set(guildId, filtered);
}

export function getWatches(guildId: string): KeywordWatch[] {
  return watchesByGuild.get(guildId) ?? [];
}

export function getUserWatch(userId: string, guildId: string): KeywordWatch | null {
  return watchesByGuild.get(guildId)?.find((w) => w.userId === userId) ?? null;
}

export async function checkMessage(
  guildId: string,
  messageContent: string,
  messageUrl: string,
  authorTag: string,
  authorAvatar: string | null,
  client: Client,
): Promise<void> {
  const watches = watchesByGuild.get(guildId);
  if (!watches || watches.length === 0) return;

  const lowerContent = messageContent.toLowerCase();
  let notifiedCount = 0;

  for (const watch of watches) {
    const matchedKeyword = watch.keywords.find((k) => lowerContent.includes(k));
    if (!matchedKeyword) continue;

    try {
      const user = await client.users.fetch(watch.userId).catch(() => null);
      if (!user) continue;

      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🔔 Mot-clé détecté")
        .addFields(
          { name: "📝 Mot-clé", value: matchedKeyword, inline: true },
          { name: "👤 Auteur", value: authorTag, inline: true },
          { name: "💬 Message", value: messageContent.slice(0, 500), inline: false },
          { name: "🔗 Lien", value: `[Voir le message](${messageUrl})`, inline: false },
        )
        .setTimestamp();

      if (authorAvatar) {
        embed.setThumbnail(authorAvatar);
      }

      await user.send({ embeds: [embed] });
      notifiedCount++;
    } catch {
      // DM disabled — skip silently
    }
  }

  if (notifiedCount > 0) {
    logger.debug(`[KeywordHighlight] Notified ${notifiedCount} users in ${guildId}`);
  }
}

export function clearWatches(guildId: string): void {
  watchesByGuild.delete(guildId);
}
