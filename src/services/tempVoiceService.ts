/**
 * tempVoiceService.ts — Salons vocaux temporaires
 *
 * Inspiré de FluxCore : l'utilisateur rejoint un salon "hub",
 * un salon vocal privé est créé pour lui. Quand le salon est vide,
 * il est automatiquement supprimé.
 *
 * - Salon hub configurable par guilde
 * - Auto-création quand on rejoint le hub
 * - Auto-suppression quand le salon est vide
 * - Le propriétaire peut verrouiller/renomer/limiter le salon
 */

import {
  Client,
  Guild,
  VoiceState,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// Map: channelId -> ownerId (en mémoire pour rapidité)
const tempChannels = new Map<string, string>();

/**
 * Configure le salon hub pour une guilde.
 */
export async function setHubChannel(guildId: string, channelId: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO temp_voice_config (guild_id, hub_channel_id)
      VALUES (${guildId}, ${channelId})
      ON CONFLICT (guild_id) DO UPDATE SET hub_channel_id = ${channelId}
    `;
  } catch {
    // Table peut ne pas exister encore — fallback en mémoire
  }
}

/**
 * Récupère le salon hub configuré.
 */
export async function getHubChannel(guildId: string): Promise<string | null> {
  try {
    const result = await prisma.$queryRaw<{ hub_channel_id: string }[]>`
      SELECT hub_channel_id FROM temp_voice_config WHERE guild_id = ${guildId}
    `;
    return result[0]?.hub_channel_id ?? null;
  } catch {
    return null;
  }
}

// Cache en mémoire pour éviter les requêtes DB à chaque event
const hubCache = new Map<string, string>();

export async function getHubChannelCached(guildId: string): Promise<string | null> {
  if (hubCache.has(guildId)) return hubCache.get(guildId)!;
  const hubId = await getHubChannel(guildId);
  if (hubId) hubCache.set(guildId, hubId);
  return hubId;
}

export function clearHubCache(guildId: string): void {
  hubCache.delete(guildId);
}

/**
 * Gère l'événement voiceStateUpdate pour créer/supprimer les salons temporaires.
 */
export async function handleVoiceStateUpdate(
  client: Client,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild.id;
  const hubChannelId = await getHubChannelCached(guildId);

  if (!hubChannelId) return;

  // ─── L'utilisateur rejoint le hub → créer un salon temporaire ───
  if (newState.channelId === hubChannelId && newState.member) {
    await createTempVoice(newState.guild, newState.member.id, newState.member.displayName);
    // Déplacer l'utilisateur vers le nouveau salon
    // (sera fait après la création)
  }

  // ─── L'utilisateur quitte un salon temporaire → vérifier s'il est vide ───
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (channel && channel.type === ChannelType.GuildVoice) {
      const voiceChannel = channel as import("discord.js").VoiceChannel;
      if (voiceChannel.members.size === 0) {
        await deleteTempVoice(oldState.guild, oldState.channelId);
      }
    }
  }
}

/**
 * Crée un salon vocal temporaire.
 */
async function createTempVoice(
  guild: Guild,
  ownerId: string,
  displayName: string,
): Promise<string | null> {
  try {
    const hubChannelId = await getHubChannelCached(guild.id);
    if (!hubChannelId) return null;

    const hubChannel = guild.channels.cache.get(hubChannelId);
    if (!hubChannel || hubChannel.type !== ChannelType.GuildVoice) return null;

    const parent = hubChannel.parent;

    const tempChannel = await guild.channels.create({
      name: `🔊 ${displayName}'s Room`,
      type: ChannelType.GuildVoice,
      parent: parent?.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        },
        {
          id: ownerId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
          ],
          type: OverwriteType.Member,
        },
      ],
    });

    tempChannels.set(tempChannel.id, ownerId);
    logger.info(`[TempVoice] Created #${tempChannel.name} for ${displayName}`);

    // Déplacer le membre vers le nouveau salon
    const member = await guild.members.fetch(ownerId).catch(() => null);
    if (member && member.voice.channelId === hubChannelId) {
      await member.voice.setChannel(tempChannel).catch(() => {});
    }

    return tempChannel.id;
  } catch (error) {
    logger.error("[TempVoice] Error creating channel:", error);
    return null;
  }
}

/**
 * Supprime un salon vocal temporaire.
 */
async function deleteTempVoice(guild: Guild, channelId: string): Promise<void> {
  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      tempChannels.delete(channelId);
      return;
    }

    await channel.delete("Salon vocal temporaire vide");
    tempChannels.delete(channelId);
    logger.info(`[TempVoice] Deleted #${channel.name} (empty)`);
  } catch (error) {
    logger.error("[TempVoice] Error deleting channel:", error);
    tempChannels.delete(channelId);
  }
}

/**
 * Vérifie si un salon est un salon temporaire et qui en est le propriétaire.
 */
export function getTempVoiceOwner(channelId: string): string | null {
  return tempChannels.get(channelId) ?? null;
}

/**
 * Verrouille un salon temporaire (empêche les nouveaux de rejoindre).
 */
export async function lockTempVoice(
  guild: Guild,
  channelId: string,
  ownerId: string,
): Promise<boolean> {
  if (tempChannels.get(channelId) !== ownerId) return false;

  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return false;

    await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
      Connect: false,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Déverrouille un salon temporaire.
 */
export async function unlockTempVoice(
  guild: Guild,
  channelId: string,
  ownerId: string,
): Promise<boolean> {
  if (tempChannels.get(channelId) !== ownerId) return false;

  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return false;

    await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
      Connect: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Renomme un salon temporaire.
 */
export async function renameTempVoice(
  guild: Guild,
  channelId: string,
  ownerId: string,
  newName: string,
): Promise<boolean> {
  if (tempChannels.get(channelId) !== ownerId) return false;

  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return false;

    await channel.setName(`🔊 ${newName}`.slice(0, 100));
    return true;
  } catch {
    return false;
  }
}

/**
 * Définit la limite d'utilisateurs d'un salon temporaire.
 */
export async function limitTempVoice(
  guild: Guild,
  channelId: string,
  ownerId: string,
  limit: number,
): Promise<boolean> {
  if (tempChannels.get(channelId) !== ownerId) return false;

  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return false;

    const voiceChannel = channel as import("discord.js").VoiceChannel;
    await voiceChannel.setUserLimit(limit);
    return true;
  } catch {
    return false;
  }
}

/**
 * Transfère la propriété du salon temporaire.
 */
export function transferTempVoiceOwnership(
  channelId: string,
  currentOwnerId: string,
  newOwnerId: string,
): boolean {
  if (tempChannels.get(channelId) !== currentOwnerId) return false;
  tempChannels.set(channelId, newOwnerId);
  return true;
}
