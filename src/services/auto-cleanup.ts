import { Client, TextChannel, Message } from "discord.js";
import { config } from "../config";
import logger from "../utils/logger";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const FETCH_LIMIT = 100;
const INDIVIDUAL_DELETE_DELAY_MS = 500;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function extractMessageKey(message: Message): string {
  const urlMatch = message.content.match(/https?:\/\/[^\s)]+/);
  if (urlMatch) return normalizeUrl(urlMatch[0]);

  if (message.embeds.length > 0) {
    for (const embed of message.embeds) {
      if (embed.url) return normalizeUrl(embed.url);
      const descUrl = embed.description?.match(/https?:\/\/[^\s)]+/);
      if (descUrl) return normalizeUrl(descUrl[0]);
    }
  }

  return normalizeText(message.content);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "ref_src", "source", "fbclid", "gclid", "s", "t"];
    for (const p of trackingParams) u.searchParams.delete(p);
    return (u.origin + u.pathname.replace(/\/$/, "") + u.search + u.hash);
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<@[!&]?\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/[\u{1F600}-\u{1FAFF}]/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface DedupResult {
  channelName: string;
  removed: number;
  errors: number;
}

async function deduplicateChannel(channel: TextChannel): Promise<DedupResult> {
  const result: DedupResult = { channelName: channel.name, removed: 0, errors: 0 };
  try {
    const messages = await channel.messages.fetch({ limit: FETCH_LIMIT });
    if (messages.size < 2) return result;

    const byKey = new Map<string, Message[]>();
    for (const message of messages.values()) {
      // Ignorer uniquement les messages système (pas les bots — le bot poste les notifs)
      if (message.system) continue;
      const key = extractMessageKey(message);
      if (!key || key.length < 3) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(message);
    }

    const now = Date.now();
    const toBulkDelete: Message[] = [];
    const toIndividualDelete: Message[] = [];

    for (const [, group] of byKey) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const duplicates = group.slice(1);
      for (const dup of duplicates) {
        if (now - dup.createdTimestamp < FOURTEEN_DAYS_MS) {
          toBulkDelete.push(dup);
        } else {
          toIndividualDelete.push(dup);
        }
      }
    }

    // Suppression bulk
    if (toBulkDelete.length > 0) {
      try {
        for (let i = 0; i < toBulkDelete.length; i += 100) {
          const batch = toBulkDelete.slice(i, i + 100);
          const deleted = await channel.bulkDelete(batch, true);
          result.removed += deleted.size;
        }
      } catch {
        logger.warn(`[Menage Auto] bulkDelete echoue pour #${channel.name}, fallback individuel`);
        // Ne repousser QUE les messages non encore supprimes
        const stillThere: Message[] = [];
        for (const msg of toBulkDelete) {
          try {
            const fetched = await channel.messages.fetch(msg.id);
            if (fetched) stillThere.push(fetched);
          } catch { /* deja supprime */ }
        }
        toIndividualDelete.push(...stillThere);
      }
    }

    // Suppression individuelle avec delai anti-rate-limit
    for (const dup of toIndividualDelete) {
      try {
        await dup.delete();
        result.removed++;
        await new Promise((resolve) => setTimeout(resolve, INDIVIDUAL_DELETE_DELAY_MS));
      } catch {
        result.errors++;
      }
    }
  } catch (err) {
    logger.warn(`[Menage Auto] Erreur scan #${channel.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

async function runAutoCleanup(client: Client): Promise<void> {
  const channelIds: string[] = [];
  const configChannels: (string | undefined | null)[] = [
    config.steamEpicChannel, config.steamChannel, config.freeGamesChannel,
    config.playstationChannel, config.fortniteChannel, config.xboxChannel,
    config.nintendoChannel, config.robloxChannel, config.instantGamingChannel,
    config.gamingBlogChannel, config.twitterChannel,
  ];
  for (const id of configChannels) {
    if (id && !channelIds.includes(id)) channelIds.push(id);
  }
  if (channelIds.length === 0) {
    logger.warn("[Menage Auto] Aucun salon de notification configure");
    return;
  }

  let totalRemoved = 0;
  let totalErrors = 0;
  for (const channelId of channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || channel.isDMBased()) continue;
      const result = await deduplicateChannel(channel as TextChannel);
      totalRemoved += result.removed;
      totalErrors += result.errors;
      if (result.removed > 0) {
        console.log(`[Menage Auto] ${result.removed} doublons supprimes dans le salon #${result.channelName}`);
      }
    } catch (err) {
      logger.debug(`[Menage Auto] Salon ${channelId} inaccessible: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (totalRemoved > 0) {
    console.log(`[Menage Auto] Total: ${totalRemoved} doublons supprimes sur ${channelIds.length} salons (${totalErrors} echecs)`);
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let initialTimeout: ReturnType<typeof setTimeout> | null = null;

export function startAutoCleanup(client: Client): void {
  if (cleanupInterval) return;
  logger.info(`[Menage Auto] Tache programmee toutes les ${CLEANUP_INTERVAL_MS / 60000} minutes`);
  initialTimeout = setTimeout(() => {
    runAutoCleanup(client).catch((err) =>
      logger.error(`[Menage Auto] Erreur premier cycle: ${err instanceof Error ? err.message : String(err)}`)
    );
  }, 30_000);
  cleanupInterval = setInterval(() => {
    runAutoCleanup(client).catch((err) =>
      logger.error(`[Menage Auto] Erreur cycle: ${err instanceof Error ? err.message : String(err)}`)
    );
  }, CLEANUP_INTERVAL_MS);

  // Enregistrer pour nettoyage au shutdown
  try {
    const { registerInterval } = require("../shutdown");
    registerInterval(cleanupInterval);
  } catch { /* shutdown module pas encore charge */ }
}

export function stopAutoCleanup(): void {
  if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
  if (initialTimeout) { clearTimeout(initialTimeout); initialTimeout = null; }
  logger.info("[Menage Auto] Tache arretee");
}

export { runAutoCleanup };
