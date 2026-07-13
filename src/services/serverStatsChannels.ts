/**
 * serverStatsChannels.ts — Live server stats in voice channels
 *
 * Creates voice channels that display live counts (members, online, boost, channels).
 * Updates periodically. Channels are locked (no one can join).
 */

import { Guild, ChannelType, PermissionFlagsBits, VoiceChannel } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export interface ServerStatsConfig {
  enabled: boolean;
  categoryChannelId?: string;
  memberChannelId?: string;
  onlineChannelId?: string;
  boostChannelId?: string;
  channelCountId?: string;
  roleCountId?: string;
  updateIntervalMs: number;
}

const DEFAULT_CONFIG: ServerStatsConfig = {
  enabled: false,
  updateIntervalMs: 300_000, // 5 min
};

const configs = new Map<string, ServerStatsConfig>();

export async function getServerStatsConfig(guildId: string): Promise<ServerStatsConfig> {
  const cached = configs.get(guildId);
  if (cached) return cached;
  try {
    const record = await prisma.guildConfig.findUnique({ where: { guildId } }).catch(() => null);
    if (record?.serverStatsConfig) {
      const parsed = {
        ...DEFAULT_CONFIG,
        ...(JSON.parse(record.serverStatsConfig as string) as Partial<ServerStatsConfig>),
      };
      configs.set(guildId, parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG };
}

export async function setServerStatsConfig(
  guildId: string,
  config: Partial<ServerStatsConfig>,
): Promise<void> {
  try {
    const current = await getServerStatsConfig(guildId);
    const merged = { ...current, ...config };
    configs.set(guildId, merged);
    await prisma.guildConfig
      .upsert({
        where: { guildId },
        create: { guildId, serverStatsConfig: JSON.stringify(merged) },
        update: { serverStatsConfig: JSON.stringify(merged) },
      })
      .catch(() => {});
  } catch (error) {
    logger.error("[ServerStats] setServerStatsConfig:", String(error));
  }
}

// ─── Setup ────────────────────────────────────────────────────────────

export async function setupStatsChannels(guild: Guild): Promise<ServerStatsConfig> {
  const config = await getServerStatsConfig(guild.id);

  // Create category if not exists
  if (!config.categoryChannelId) {
    const category = await guild.channels
      .create({
        name: "📊 Server Stats",
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.Connect],
          },
        ],
      })
      .catch(() => null);

    if (category) {
      config.categoryChannelId = category.id;
    }
  }

  // Create channels
  const createStatChannel = async (name: string): Promise<string | null> => {
    const channel = await guild.channels
      .create({
        name,
        type: ChannelType.GuildVoice,
        parent: config.categoryChannelId,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.Connect],
          },
        ],
      })
      .catch(() => null);
    return channel?.id ?? null;
  };

  if (!config.memberChannelId) {
    config.memberChannelId = (await createStatChannel("Members: 0")) ?? undefined;
  }
  if (!config.onlineChannelId) {
    config.onlineChannelId = (await createStatChannel("Online: 0")) ?? undefined;
  }
  if (!config.boostChannelId) {
    config.boostChannelId = (await createStatChannel("Boosts: 0")) ?? undefined;
  }
  if (!config.channelCountId) {
    config.channelCountId = (await createStatChannel("Channels: 0")) ?? undefined;
  }
  if (!config.roleCountId) {
    config.roleCountId = (await createStatChannel("Roles: 0")) ?? undefined;
  }

  config.enabled = true;
  await setServerStatsConfig(guild.id, config);

  // Initial update
  await updateStatsChannels(guild, config);

  return config;
}

// ─── Update ───────────────────────────────────────────────────────────

export async function updateStatsChannels(guild: Guild, config?: ServerStatsConfig): Promise<void> {
  const cfg = config ?? (await getServerStatsConfig(guild.id));
  if (!cfg.enabled) return;

  const memberCount = guild.memberCount;
  const onlineCount = guild.members.cache.filter((m) => m.presence?.status === "online").size;
  const boostCount = guild.premiumSubscriptionCount ?? 0;
  const channelCount = guild.channels.cache.size;
  const roleCount = guild.roles.cache.size;

  const updateChannel = async (channelId: string | undefined, name: string): Promise<void> => {
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
    if (channel && channel.type === ChannelType.GuildVoice) {
      await channel.setName(name).catch(() => {});
    }
  };

  await Promise.all([
    updateChannel(cfg.memberChannelId, `👥 Members: ${memberCount}`),
    updateChannel(cfg.onlineChannelId, `🟢 Online: ${onlineCount}`),
    updateChannel(cfg.boostChannelId, `🚀 Boosts: ${boostCount}`),
    updateChannel(cfg.channelCountId, `📝 Channels: ${channelCount}`),
    updateChannel(cfg.roleCountId, `🎭 Roles: ${roleCount}`),
  ]);
}

// ─── Teardown ─────────────────────────────────────────────────────────

export async function teardownStatsChannels(guild: Guild): Promise<void> {
  const config = await getServerStatsConfig(guild.id);

  const deleteChannel = async (channelId: string | undefined): Promise<void> => {
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (channel) await channel.delete("Server stats disabled").catch(() => {});
  };

  await Promise.all([
    deleteChannel(config.memberChannelId),
    deleteChannel(config.onlineChannelId),
    deleteChannel(config.boostChannelId),
    deleteChannel(config.channelCountId),
    deleteChannel(config.roleCountId),
    deleteChannel(config.categoryChannelId),
  ]);

  await setServerStatsConfig(guild.id, {
    enabled: false,
    memberChannelId: undefined,
    onlineChannelId: undefined,
    boostChannelId: undefined,
    channelCountId: undefined,
    roleCountId: undefined,
    categoryChannelId: undefined,
  });
  logger.info(`[ServerStats] Torn down in ${guild.id}`);
}

// ─── Status embed ─────────────────────────────────────────────────────

export async function generateStatsStatusEmbed(guild: Guild): Promise<{
  title: string;
  color: number;
  fields: { name: string; value: string; inline: boolean }[];
}> {
  const config = await getServerStatsConfig(guild.id);
  return {
    title: "📊 Server Stats Channels",
    color: config.enabled ? 0x2ecc71 : 0xe74c3c,
    fields: [
      { name: "Status", value: config.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      { name: "Interval", value: `${config.updateIntervalMs / 1000}s`, inline: true },
      { name: "Members", value: config.memberChannelId ? "✅" : "❌", inline: true },
      { name: "Online", value: config.onlineChannelId ? "✅" : "❌", inline: true },
      { name: "Boosts", value: config.boostChannelId ? "✅" : "❌", inline: true },
      { name: "Channels", value: config.channelCountId ? "✅" : "❌", inline: true },
      { name: "Roles", value: config.roleCountId ? "✅" : "❌", inline: true },
    ],
  };
}
