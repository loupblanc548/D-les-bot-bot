/**
 * serverBackup.ts — Server configuration backup & restore
 *
 * Backs up roles, channels, categories to JSON. Can restore on disaster.
 */

import { Guild, ChannelType, Role } from "discord.js";
import logger from "../utils/logger.js";

export interface BackupRole {
  name: string;
  permissions: string[];
  color: number;
  hoist: boolean;
  mentionable: boolean;
  position: number;
}

export interface BackupChannel {
  name: string;
  type: string;
  parentId?: string;
  topic?: string;
  position: number;
  nsfw: boolean;
  bitrate?: number;
  userLimit?: number;
}

export interface BackupCategory {
  name: string;
  position: number;
}

export interface ServerBackup {
  id: string;
  guildId: string;
  guildName: string;
  createdAt: Date;
  roles: BackupRole[];
  channels: BackupChannel[];
  categories: BackupCategory[];
  memberCount: number;
}

export async function createBackup(guild: Guild): Promise<ServerBackup> {
  const backup: ServerBackup = {
    id: `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    guildId: guild.id,
    guildName: guild.name,
    createdAt: new Date(),
    roles: [],
    channels: [],
    categories: [],
    memberCount: guild.memberCount,
  };

  // Backup roles (exclude @everyone and managed/bot roles)
  const roles = guild.roles.cache
    .filter((r: Role) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position);

  for (const [, role] of roles) {
    backup.roles.push({
      name: role.name,
      permissions: role.permissions.toArray(),
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      position: role.position,
    });
  }

  // Backup categories first
  const categories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  for (const [, cat] of categories) {
    backup.categories.push({
      name: cat.name,
      position: cat.position,
    });
  }

  // Backup channels (exclude categories, threads)
  const channels = guild.channels.cache
    .filter((c) =>
      c.type === ChannelType.GuildText ||
      c.type === ChannelType.GuildVoice ||
      c.type === ChannelType.GuildAnnouncement ||
      c.type === ChannelType.GuildStageVoice,
    )
    .sort((a, b) => a.position - b.position);

  for (const [, ch] of channels) {
    const entry: BackupChannel = {
      name: ch.name,
      type: ChannelType[ch.type],
      position: ch.position,
      nsfw: (ch as { nsfw?: boolean }).nsfw ?? false,
    };

    if (ch.parentId) entry.parentId = ch.parentId;
    if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
      entry.topic = (ch as { topic?: string }).topic ?? undefined;
    }
    if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
      entry.bitrate = (ch as { bitrate?: number }).bitrate;
      entry.userLimit = (ch as { userLimit?: number }).userLimit ?? 0;
    }

    backup.channels.push(entry);
  }

  logger.info(`[ServerBackup] Created backup for ${guild.name}: ${backup.roles.length} roles, ${backup.channels.length} channels, ${backup.categories.length} categories`);
  return backup;
}

export function exportBackupJson(backup: ServerBackup): string {
  return JSON.stringify(backup, null, 2);
}

export async function restoreBackup(
  guild: Guild,
  backup: ServerBackup,
): Promise<{ restored: number; failed: number }> {
  let restored = 0;
  let failed = 0;

  // Restore categories first
  const categoryMap = new Map<string, string>(); // oldName -> newId

  for (const cat of backup.categories) {
    try {
      const created = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory,
      });
      categoryMap.set(cat.name, created.id);
      await created.setPosition(cat.position).catch(() => {});
      restored++;
    } catch (error) {
      logger.error(`[ServerBackup] Failed to restore category ${cat.name}:`, String(error));
      failed++;
    }
  }

  // Restore channels
  for (const ch of backup.channels) {
    try {
      const typeMap: Record<string, ChannelType> = {
        GuildText: ChannelType.GuildText,
        GuildVoice: ChannelType.GuildVoice,
        GuildAnnouncement: ChannelType.GuildAnnouncement,
        GuildStageVoice: ChannelType.GuildStageVoice,
      };

      const channelType = typeMap[ch.type] ?? ChannelType.GuildText;
      const createOptions: Record<string, unknown> = {
        name: ch.name,
        type: channelType,
        nsfw: ch.nsfw,
      };

      if (ch.topic) createOptions.topic = ch.topic;
      if (ch.bitrate) createOptions.bitrate = ch.bitrate;
      if (ch.userLimit) createOptions.userLimit = ch.userLimit;

      // Find parent category by name
      if (ch.parentId) {
        const oldCategory = backup.categories.find((c) => {
          // Try to match by position or name
          return c.position === backup.categories.findIndex((cat) => cat.name === ch.parentId);
        });
        if (oldCategory) {
          const newParentId = categoryMap.get(oldCategory.name);
          if (newParentId) createOptions.parent = newParentId;
        }
      }

      const created = await guild.channels.create(createOptions as unknown as Parameters<typeof guild.channels.create>[0]);
      await created.setPosition(ch.position).catch(() => {});
      restored++;
    } catch (error) {
      logger.error(`[ServerBackup] Failed to restore channel ${ch.name}:`, String(error));
      failed++;
    }
  }

  // Restore roles
  for (const role of backup.roles) {
    try {
      await guild.roles.create({
        name: role.name,
        permissions: role.permissions as unknown as bigint,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
      });
      restored++;
    } catch (error) {
      logger.error(`[ServerBackup] Failed to restore role ${role.name}:`, String(error));
      failed++;
    }
  }

  logger.info(`[ServerBackup] Restore complete: ${restored} restored, ${failed} failed`);
  return { restored, failed };
}

export function generateBackupSummaryEmbed(backup: ServerBackup): { title: string; fields: { name: string; value: string; inline: boolean }[] } {
  return {
    title: `📦 Backup — ${backup.guildName}`,
    fields: [
      { name: "🆔 ID", value: backup.id, inline: false },
      { name: "📅 Date", value: `<t:${Math.floor(backup.createdAt.getTime() / 1000)}:F>`, inline: true },
      { name: "👥 Members", value: String(backup.memberCount), inline: true },
      { name: "🎭 Roles", value: String(backup.roles.length), inline: true },
      { name: "📝 Channels", value: String(backup.channels.length), inline: true },
      { name: "📁 Categories", value: String(backup.categories.length), inline: true },
    ],
  };
}
