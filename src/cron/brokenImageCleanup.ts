import { Client, TextChannel, EmbedBuilder, ChannelType } from "discord.js";
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { FALLBACK_EMBED_IMAGE } from "../utils/image-helpers.js";

const SCAN_CRON_EXPRESSION = "0 3 * * 1";
const SCAN_LIMIT = 50;
const DELETE_DELAY_MS = 500;

let cronJob: ScheduledTask | null = null;

function isBrokenImageUrl(url: string | null | undefined): boolean {
  if (!url || url === "") return true;
  if (url === "none" || url === "undefined" || url === "null") return true;
  if (/\.ico(\?|#|$)/i.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return true;
  if (!/\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url)) return true;
  return false;
}

function getNotificationChannelIds(): string[] {
  const ids: string[] = [];
  const envKeys: (keyof typeof config)[] = [
    "steamEpicChannel",
    "playstationChannel",
    "xboxChannel",
    "nintendoChannel",
    "fortniteChannel",
    "instantGamingChannel",
    "twitterChannel",
    "gamingBlogChannel",
    "freeGamesChannel",
    "dedicatedChannel",
    "dealsChannel",
    "boutiqueChannel",
  ];
  for (const key of envKeys) {
    const val = config[key];
    if (typeof val === "string" && val.trim().length > 0) {
      ids.push(val.trim());
    }
  }
  return [...new Set(ids)];
}

function resolveYoutubeThumb(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "youtube.com" && host !== "www.youtube.com" && host !== "youtu.be" && host !== "m.youtube.com") return null;
  } catch {
    return null;
  }
  const match = url.match(
    /(?:youtube\.com\/watch\?(?:.*[?&])?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  );
  if (!match) return null;
  return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
}

async function scanAndFixChannel(client: Client, channelId: string): Promise<{ scanned: number; broken: number; fixed: number; errors: number }> {
  const stats = { scanned: 0, broken: 0, fixed: 0, errors: 0 };

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch {
    logger.warn(`[BrokenImageCleanup] Salon ${channelId} introuvable — ignoré`);
    return stats;
  }
  if (!channel || channel.type !== ChannelType.GuildText) return stats;

  const textChannel = channel as TextChannel;

  let messages;
  try {
    messages = await textChannel.messages.fetch({ limit: SCAN_LIMIT });
  } catch (err) {
    logger.error(`[BrokenImageCleanup] Fetch messages ${channelId}: ${err instanceof Error ? err.message : String(err)}`);
    return stats;
  }

  for (const [msgId, msg] of messages) {
    stats.scanned++;
    if (msg.embeds.length === 0) continue;
    if (msg.author.id !== client.user?.id) continue;

    let brokenEmbedIndex = -1;
    for (let i = 0; i < msg.embeds.length; i++) {
      const embed = msg.embeds[i];
      if (embed.image && isBrokenImageUrl(embed.image.url)) {
        brokenEmbedIndex = i;
        break;
      }
    }
    if (brokenEmbedIndex === -1) continue;

    stats.broken++;

    try {
      const originalEmbed = msg.embeds[brokenEmbedIndex];
      const rebuiltEmbed = EmbedBuilder.from(originalEmbed);

      const imageUrl = originalEmbed.image?.url;
      if (isBrokenImageUrl(imageUrl)) {
        const ytThumb = resolveYoutubeThumb(originalEmbed.url ?? undefined);
        rebuiltEmbed.setImage(ytThumb ?? FALLBACK_EMBED_IMAGE);
      }

      await msg.delete();
      await textChannel.send({
        embeds: [rebuiltEmbed],
        content: msg.content || undefined,
      });

      stats.fixed++;
      logger.info(`[BrokenImageCleanup] Corrigé: ${msgId} dans #${textChannel.name}`);
      await new Promise((resolve) => setTimeout(resolve, DELETE_DELAY_MS));
    } catch (fixErr) {
      stats.errors++;
      logger.error(`[BrokenImageCleanup] Erreur correction ${msgId}: ${fixErr instanceof Error ? fixErr.message : String(fixErr)}`);
    }
  }

  return stats;
}

async function runBrokenImageCleanup(client: Client): Promise<void> {
  const channelIds = getNotificationChannelIds();
  if (channelIds.length === 0) return;

  logger.info(`[BrokenImageCleanup] Scan de ${channelIds.length} salon(s)...`);

  let totalScanned = 0;
  let totalBroken = 0;
  let totalFixed = 0;
  let totalErrors = 0;

  for (const channelId of channelIds) {
    const stats = await scanAndFixChannel(client, channelId);
    totalScanned += stats.scanned;
    totalBroken += stats.broken;
    totalFixed += stats.fixed;
    totalErrors += stats.errors;
  }

  if (totalBroken > 0) {
    logger.info(
      `[BrokenImageCleanup] Terminé: ${totalScanned} scannés, ${totalBroken} brisés, ${totalFixed} corrigés, ${totalErrors} erreurs`,
    );
  }
}

export function startBrokenImageCleanup(client: Client): void {
  if (cronJob) {
    logger.warn("[BrokenImageCleanup] Déjà actif — ignoré");
    return;
  }

  setTimeout(() => {
    runBrokenImageCleanup(client).catch((err) =>
      logger.error(`[BrokenImageCleanup] Erreur scan initial: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, 30_000);

  cronJob = cron.schedule(SCAN_CRON_EXPRESSION, () => {
    runBrokenImageCleanup(client).catch((err) =>
      logger.error(`[BrokenImageCleanup] Erreur cron: ${err instanceof Error ? err.message : String(err)}`),
    );
  });

  logger.info(`[BrokenImageCleanup] Cron démarré (${SCAN_CRON_EXPRESSION}) + scan initial dans 30s`);
}
