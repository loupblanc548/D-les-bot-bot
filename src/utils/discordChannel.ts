/**
 * Fetch de salon texte avec cache 30 min pour les IDs morts (évite le spam 404).
 */
import { ChannelType, Client, TextChannel } from "discord.js";
import logger from "./logger.js";

const missingUntil = new Map<string, number>();
const TTL_MS = 30 * 60 * 1000;

export async function fetchTextChannel(
  client: Client,
  channelId: string | null | undefined,
): Promise<TextChannel | null> {
  if (!channelId) return null;
  const blocked = missingUntil.get(channelId);
  if (blocked && Date.now() < blocked) return null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (
      channel &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
    ) {
      missingUntil.delete(channelId);
      return channel as TextChannel;
    }
    missingUntil.set(channelId, Date.now() + TTL_MS);
    return null;
  } catch {
    missingUntil.set(channelId, Date.now() + TTL_MS);
    logger.warn(`[Channels] Salon ${channelId} introuvable — ignoré 30 min`);
    return null;
  }
}
