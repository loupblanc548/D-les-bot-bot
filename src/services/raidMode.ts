/**
 * raidMode.ts — Raid Mode (Panic Lockdown)
 *
 * Toggle raid mode: lockdown all channels, disable invites,
 * strict verification, auto-kick new accounts.
 */

import { Guild, EmbedBuilder, TextChannel, ChannelType, PermissionFlagsBits } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export interface RaidModeConfig {
  active: boolean;
  activatedAt?: Date;
  activatedBy?: string;
  lockdownChannels: boolean;
  disableInvites: boolean;
  autoKickNewAccounts: boolean;
  minAccountAgeHours: number;
  notifyChannelId?: string;
}

const DEFAULT_CONFIG: RaidModeConfig = {
  active: false,
  lockdownChannels: true,
  disableInvites: true,
  autoKickNewAccounts: false,
  minAccountAgeHours: 24,
};

// In-memory state per guild
const raidState = new Map<string, RaidModeConfig>();

export async function getRaidModeConfig(guildId: string): Promise<RaidModeConfig> {
  const cached = raidState.get(guildId);
  if (cached) return { ...cached };
  return { ...DEFAULT_CONFIG };
}

export async function enableRaidMode(
  guild: Guild,
  activatedBy: string,
  options?: Partial<RaidModeConfig>,
): Promise<RaidModeConfig> {
  const config: RaidModeConfig = {
    ...DEFAULT_CONFIG,
    ...options,
    active: true,
    activatedAt: new Date(),
    activatedBy,
  };

  raidState.set(guild.id, config);

  // Lockdown channels
  if (config.lockdownChannels) {
    const channels = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildText,
    );
    for (const [, channel] of channels) {
      await channel.permissionOverwrites
        .edit(guild.roles.everyone, {
          SendMessages: false,
          AddReactions: false,
          CreatePublicThreads: false,
        })
        .catch(() => {});
    }
  }

  // Disable invites (delete all active invites)
  if (config.disableInvites) {
    try {
      const invites = await guild.invites.fetch();
      for (const [, invite] of invites) {
        await invite.delete("Raid mode activated").catch(() => {});
      }
    } catch { /* missing manage invites permission */ }
  }

  // Notify
  if (config.notifyChannelId) {
    const channel = guild.channels.cache.get(config.notifyChannelId) as TextChannel | undefined;
    if (channel && channel.type === ChannelType.GuildText) {
      const embed = new EmbedBuilder()
        .setTitle("🚨 RAID MODE ACTIVÉ")
        .setColor(0xe74c3c)
        .setDescription([
          "Le serveur est en mode raid.",
          "Tous les channels sont verrouillés.",
          "Les invitations sont désactivées.",
          config.autoKickNewAccounts ? "Les nouveaux comptes seront expulsés." : "",
          "",
          "Activé par <@" + activatedBy + ">",
        ].filter(Boolean).join("\n"))
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  logger.warn(`[RaidMode] Enabled in ${guild.id} by ${activatedBy}`);
  return config;
}

export async function disableRaidMode(guild: Guild): Promise<void> {
  const config = raidState.get(guild.id);
  if (!config || !config.active) return;

  // Unlock channels
  if (config.lockdownChannels) {
    const channels = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildText,
    );
    for (const [, channel] of channels) {
      await channel.permissionOverwrites
        .edit(guild.roles.everyone, {
          SendMessages: null,
          AddReactions: null,
          CreatePublicThreads: null,
        })
        .catch(() => {});
    }
  }

  // Re-enable invites (nothing to do — invites were deleted, mods can recreate)
  if (config.disableInvites) {
    // Invites were deleted during lockdown; mods need to recreate them
  }

  // Notify
  if (config.notifyChannelId) {
    const channel = guild.channels.cache.get(config.notifyChannelId) as TextChannel | undefined;
    if (channel && channel.type === ChannelType.GuildText) {
      const embed = new EmbedBuilder()
        .setTitle("✅ RAID MODE DÉSACTIVÉ")
        .setColor(0x2ecc71)
        .setDescription("Le serveur reprend son fonctionnement normal.")
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  raidState.delete(guild.id);
  logger.info(`[RaidMode] Disabled in ${guild.id}`);
}

export async function checkNewMemberRaidMode(
  guild: Guild,
  memberId: string,
  accountCreatedTimestamp: number,
): Promise<{ kick: boolean; reason: string }> {
  const config = raidState.get(guild.id);
  if (!config || !config.active || !config.autoKickNewAccounts) {
    return { kick: false, reason: "" };
  }

  const accountAgeHours = (Date.now() - accountCreatedTimestamp) / 3_600_000;
  if (accountAgeHours < config.minAccountAgeHours) {
    return {
      kick: true,
      reason: `Raid mode: compte trop récent (${accountAgeHours.toFixed(1)}h < ${config.minAccountAgeHours}h)`,
    };
  }

  return { kick: false, reason: "" };
}

export async function generateRaidModeStatusEmbed(guildId: string): Promise<EmbedBuilder> {
  const config = await getRaidModeConfig(guildId);
  return new EmbedBuilder()
    .setTitle("🚨 Raid Mode Status")
    .setColor(config.active ? 0xe74c3c : 0x2ecc71)
    .addFields(
      { name: "Status", value: config.active ? "🔴 ACTIVÉ" : "🟢 Désactivé", inline: true },
      { name: "Lockdown channels", value: config.lockdownChannels ? "✅" : "❌", inline: true },
      { name: "Invites désactivées", value: config.disableInvites ? "✅" : "❌", inline: true },
      { name: "Auto-kick new accounts", value: config.autoKickNewAccounts ? "✅" : "❌", inline: true },
      { name: "Min account age", value: `${config.minAccountAgeHours}h`, inline: true },
      { name: "Activé par", value: config.activatedBy ? `<@${config.activatedBy}>` : "N/A", inline: true },
    )
    .setTimestamp();
}
