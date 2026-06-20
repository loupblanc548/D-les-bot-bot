import prisma from "../../prisma.js";
import logger from "../../utils/logger.js";

interface GuildConfigData {
  guildId: string;
  logChannelId?: string;
  freeGamesChannelId?: string;
  monitoringEnabled?: boolean;
  monitoringIntervalMs?: number;
  maxRetroPosts?: number;
}

export async function getGuildConfig(guildId: string) {
  try {
    let config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      config = await prisma.guildConfig.create({
        data: { guildId },
      });
      logger.info(`[GuildConfig] Created default config for guild ${guildId}`);
    }

    return config;
  } catch (error) {
    logger.error(`[GuildConfig] Error getting config for guild ${guildId}:`, error);
    return null;
  }
}

export async function updateGuildConfig(guildId: string, data: Partial<GuildConfigData>) {
  try {
    const config = await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });

    logger.info(`[GuildConfig] Updated config for guild ${guildId}`);
    return config;
  } catch (error) {
    logger.error(`[GuildConfig] Error updating config for guild ${guildId}:`, error);
    return null;
  }
}

export async function getLogChannelId(guildId: string): Promise<string | null> {
  const config = await getGuildConfig(guildId);
  return config?.logChannelId || process.env.LOG_CHANNEL_ID || null;
}

export async function getFreeGamesChannelId(guildId: string): Promise<string | null> {
  const config = await getGuildConfig(guildId);
  return config?.freeGamesChannelId || process.env.FREE_GAMES_CHANNEL_ID || null;
}

export async function isMonitoringEnabled(guildId: string): Promise<boolean> {
  const config = await getGuildConfig(guildId);
  return config?.monitoringEnabled ?? true;
}

export async function getMonitoringInterval(guildId: string): Promise<number> {
  const config = await getGuildConfig(guildId);
  return config?.monitoringIntervalMs || 300000; // 5 minutes default
}

export async function getMaxRetroPosts(guildId: string): Promise<number> {
  const config = await getGuildConfig(guildId);
  return config?.maxRetroPosts || 10;
}
