import prisma from "../../prisma.js";
import logger from "../../utils/logger.js";
import {
  getGuildConfigCached,
  updateGuildConfigCached,
  invalidateGuild,
  getLogChannelIdCached,
  isMonitoringEnabledCached,
} from "../../services/configCache.js";

interface GuildConfigData {
  guildId: string;
  logChannelId?: string;
  freeGamesChannelId?: string;
  monitoringEnabled?: boolean;
  monitoringIntervalMs?: number;
  maxRetroPosts?: number;
}

export async function getGuildConfig(guildId: string) {
  // MODULE 2: Check cache first, DB only on miss
  const cached = await getGuildConfigCached(guildId);
  if (cached) return cached.raw as Record<string, unknown> | null;

  // Fallback: direct DB query (cache layer already handles this, but as safety net)
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
    logger.error(
      `[GuildConfig] Error getting config for guild ${guildId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function updateGuildConfig(guildId: string, data: Partial<GuildConfigData>) {
  // MODULE 2: Write-through cache (updates DB + invalidates cache entry)
  const result = await updateGuildConfigCached(guildId, data as Record<string, unknown>);
  if (result) {
    logger.info(`[GuildConfig] Updated config for guild ${guildId} (cache-through)`);
    return result.raw as Record<string, unknown>;
  }

  // Fallback: direct DB
  try {
    const config = await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    invalidateGuild(guildId);
    logger.info(`[GuildConfig] Updated config for guild ${guildId}`);
    return config;
  } catch (error) {
    logger.error(
      `[GuildConfig] Error updating config for guild ${guildId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function getLogChannelId(guildId: string): Promise<string | null> {
  // MODULE 2: Cache-first
  return getLogChannelIdCached(guildId);
}

export async function getFreeGamesChannelId(guildId: string): Promise<string | null> {
  const config = await getGuildConfig(guildId);
  const record = config as Record<string, unknown> | null;
  return (record?.freeGamesChannelId as string) || process.env.FREE_GAMES_CHANNEL_ID || null;
}

export async function isMonitoringEnabled(guildId: string): Promise<boolean> {
  // MODULE 2: Cache-first
  return isMonitoringEnabledCached(guildId);
}

export async function getMonitoringInterval(guildId: string): Promise<number> {
  const config = await getGuildConfig(guildId);
  const record = config as Record<string, unknown> | null;
  return (record?.monitoringIntervalMs as number) || 300000;
}

export async function getMaxRetroPosts(guildId: string): Promise<number> {
  const config = await getGuildConfig(guildId);
  const record = config as Record<string, unknown> | null;
  return (record?.maxRetroPosts as number) || 10;
}
