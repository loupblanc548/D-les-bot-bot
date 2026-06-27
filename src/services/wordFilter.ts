/**
 * wordFilter.ts — Filtre de mots interdits automatique et configurable par serveur
 *
 * Actions possibles : delete, warn, timeout, kick, ban
 * Stockage : Prisma (WordFilterConfig + WordFilterEntry)
 */

import { Message, TextChannel, PermissionFlagsBits, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// Cache en mémoire : guildId → { words: Set, config: WordFilterConfig }
interface FilterCache {
  words: Set<string>;
  config: {
    enabled: boolean;
    action: string;
    warnMessage: string;
    logChannel: string | null;
  } | null;
}

const cache = new Map<string, FilterCache>();
const CACHE_TTL = 60_000; // 1 minute
const cacheTimestamps = new Map<string, number>();

async function loadCache(guildId: string): Promise<FilterCache> {
  const now = Date.now();
  const ts = cacheTimestamps.get(guildId);
  if (ts && now - ts < CACHE_TTL && cache.has(guildId)) {
    return cache.get(guildId)!;
  }

  const [config, entries] = await Promise.all([
    prisma.wordFilterConfig.findUnique({ where: { guildId } }),
    prisma.wordFilterEntry.findMany({ where: { guildId }, select: { word: true } }),
  ]);

  const result: FilterCache = {
    words: new Set(entries.map((e) => e.word.toLowerCase())),
    config: config
      ? {
          enabled: config.enabled,
          action: config.action,
          warnMessage: config.warnMessage,
          logChannel: config.logChannel,
        }
      : null,
  };

  cache.set(guildId, result);
  cacheTimestamps.set(guildId, now);
  return result;
}

export function invalidateCache(guildId: string): void {
  cache.delete(guildId);
  cacheTimestamps.delete(guildId);
}

/**
 * Vérifie si un message contient un mot interdit.
 * Retourne le mot trouvé ou null.
 */
export async function checkMessage(message: Message): Promise<string | null> {
  if (!message.guild || message.author.bot) return null;

  // Ignorer les admins
  if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return null;

  const { words, config } = await loadCache(message.guild.id);
  if (!config?.enabled || words.size === 0) return null;

  const content = message.content.toLowerCase();

  // Vérification mot par mot avec boundaries
  for (const word of words) {
    // Match exact avec word boundaries
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
    if (regex.test(content)) {
      return word;
    }
  }

  return null;
}

/**
 * Applique l'action configurée sur un message contenant un mot interdit.
 */
export async function enforceFilter(message: Message, matchedWord: string): Promise<void> {
  if (!message.guild) return;

  const { config } = await loadCache(message.guild.id);
  if (!config) return;

  const action = config.action;
  const member = message.member;
  const logChannelId = config.logChannel;

  try {
    switch (action) {
      case "delete":
        await message.delete().catch(() => {});
        if (config.warnMessage && message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `${message.author} ${config.warnMessage}`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
        }
        break;

      case "warn":
        await message.delete().catch(() => {});
        if (config.warnMessage && message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `${message.author} ${config.warnMessage}`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
        }
        break;

      case "timeout":
        await message.delete().catch(() => {});
        if (member) {
          await member.timeout(10 * 60 * 1000, `Word filter: "${matchedWord}"`).catch(() => {});
        }
        if (message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `⚠️ ${message.author} a été mis en timeout (10min) pour langage inapproprié.`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
        }
        break;

      case "kick":
        await message.delete().catch(() => {});
        if (member) {
          await member.kick(`Word filter: "${matchedWord}"`).catch(() => {});
        }
        if (message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `👢 ${message.author} a été expulsé pour langage inapproprié.`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
        }
        break;

      case "ban":
        await message.delete().catch(() => {});
        await message.guild.bans
          .create(message.author, { reason: `Word filter: "${matchedWord}"` })
          .catch(() => {});
        if (message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `🔨 ${message.author} a été banni pour langage inapproprié.`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
        }
        break;
    }

    // Log dans le salon configuré
    if (logChannelId) {
      const logChannel = message.guild.channels.cache.get(logChannelId);
      if (logChannel?.isTextBased()) {
        await (logChannel as TextChannel).send({
          content: `🚫 **Filtre de mots** — ${message.author.tag} (\`${message.author.id}\`) a déclenché le filtre dans <#${message.channelId}>`,
          embeds: [
            {
              title: "Mot interdit détecté",
              fields: [
                { name: "Utilisateur", value: `${message.author} (\`${message.author.id}\`)` },
                { name: "Salon", value: `<#${message.channelId}>` },
                { name: "Mot détecté", value: `\`${matchedWord}\`` },
                { name: "Action", value: action },
                {
                  name: "Message (extrait)",
                  value: message.content.slice(0, 500) || "(vide)",
                },
              ],
              color: 0xff3344,
              timestamp: new Date().toISOString(),
            },
          ],
        });
      }
    }

    logger.info(
      `[WordFilter] ${message.author.tag} dans ${message.guild.name} — mot: "${matchedWord}" — action: ${action}`,
    );
  } catch (error) {
    logger.error("[WordFilter] Erreur enforcement:", error);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
