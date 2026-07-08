/**
 * afkSystem.ts — AFK status with auto-reply on mention
 *
 * Set AFK with reason, auto-reply when mentioned, auto-clear on return.
 */

import { EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import logger from "../utils/logger.js";

export interface AfkEntry {
  userId: string;
  guildId: string;
  reason: string;
  setAt: Date;
}

const afkTracker = new Map<string, AfkEntry>();

export function setAfk(userId: string, guildId: string, reason: string): void {
  afkTracker.set(userId, { userId, guildId, reason, setAt: new Date() });
  logger.info(`[AFK] ${userId} is now AFK: ${reason}`);
}

export function getAfk(userId: string): AfkEntry | null {
  return afkTracker.get(userId) ?? null;
}

export function removeAfk(userId: string): boolean {
  const deleted = afkTracker.delete(userId);
  if (deleted) logger.info(`[AFK] ${userId} is no longer AFK`);
  return deleted;
}

export function isAfk(userId: string): boolean {
  return afkTracker.has(userId);
}

export function getAfkList(guildId: string): AfkEntry[] {
  return Array.from(afkTracker.values()).filter((e) => e.guildId === guildId);
}

export async function handleMention(
  guildId: string,
  mentionedUserId: string,
  channel: TextChannel,
): Promise<void> {
  if (channel.type !== ChannelType.GuildText) return;

  const entry = afkTracker.get(mentionedUserId);
  if (!entry || entry.guildId !== guildId) return;

  const elapsed = Math.round((Date.now() - entry.setAt.getTime()) / 60_000);
  const timeStr = elapsed < 60 ? `${elapsed}min` : `${Math.floor(elapsed / 60)}h${elapsed % 60}min`;

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("💤 Utilisateur AFK")
    .setDescription(`<@${mentionedUserId}> est absent: **${entry.reason}**`)
    .addFields({ name: "⏰ Depuis", value: timeStr, inline: true })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

export function autoClearOnMessage(userId: string): boolean {
  return removeAfk(userId);
}
