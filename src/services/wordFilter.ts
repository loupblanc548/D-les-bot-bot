/**
 * wordFilter.ts — Filtre de mots interdits automatique et configurable par serveur
 *
 * Système gradué :
 *   1ère infraction → delete + warn (sans sanction)
 *   2ème infraction dans les 30 minutes → sanction configurée (timeout/kick/ban)
 *
 * Actions possibles : delete, warn, timeout, kick, ban
 * Stockage : Prisma (WordFilterConfig + WordFilterEntry + WordFilterInfraction)
 */

import { Message, TextChannel, PermissionFlagsBits, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const INFRACTION_WINDOW_MINUTES = 30;

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
 * Système gradué : 1ère fois = warn, 2ème fois dans les 30min = sanction.
 */
export async function enforceFilter(message: Message, matchedWord: string): Promise<void> {
  if (!message.guild) return;

  const { config } = await loadCache(message.guild.id);
  if (!config) return;

  const action = config.action;
  const member = message.member;
  const logChannelId = config.logChannel;
  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    // ── Enregistrer l'infraction ──
    await prisma.wordFilterInfraction.create({
      data: { guildId, userId, word: matchedWord },
    });

    // ── Compter les infractions dans la fenêtre temporelle ──
    const since = new Date(Date.now() - INFRACTION_WINDOW_MINUTES * 60 * 1000);
    const recentCount = await prisma.wordFilterInfraction.count({
      where: { guildId, userId, createdAt: { gte: since } },
    });

    const isRecidive = recentCount >= 2;

    // ── Supprimer le message dans tous les cas ──
    await message.delete().catch(() => {});

    if (!isRecidive) {
      // ── 1ère infraction : warn seulement ──
      if (config.warnMessage && message.channel.type === ChannelType.GuildText) {
        const warnMsg = await (message.channel as TextChannel).send(
          `${message.author} ⚠️ ${config.warnMessage}\n*(1er avertissement — la prochaine fois dans les ${INFRACTION_WINDOW_MINUTES}min, la sanction tombera)*`,
        );
        setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
      }

      // Log 1er avertissement
      if (logChannelId) {
        const logChannel = message.guild.channels.cache.get(logChannelId);
        if (logChannel?.isTextBased()) {
          await (logChannel as TextChannel).send({
            content: `⚠️ **Filtre de mots (1er avert.)** — ${message.author.tag} (\`${userId}\`) dans <#${message.channelId}>`,
            embeds: [
              {
                title: "Mot interdit détecté (1er avertissement)",
                fields: [
                  { name: "Utilisateur", value: `${message.author} (\`${userId}\`)` },
                  { name: "Salon", value: `<#${message.channelId}>` },
                  { name: "Mot détecté", value: `\`${matchedWord}\`` },
                  { name: "Action", value: "Warn (1ère fois)" },
                  { name: "Message (extrait)", value: message.content.slice(0, 500) || "(vide)" },
                ],
                color: 0xffaa00,
                timestamp: new Date().toISOString(),
              },
            ],
          });
        }
      }

      logger.info(
        `[WordFilter] 1er avert. ${message.author.tag} dans ${message.guild.name} — mot: "${matchedWord}"`,
      );
      return;
    }

    // ── 2ème infraction : sanction configurée ──
    switch (action) {
      case "delete":
        // delete déjà fait, juste warn plus ferme
        if (config.warnMessage && message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `⚠️ ${message.author} ${config.warnMessage} *(récidive — message supprimé)*`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
        }
        break;

      case "warn":
        if (config.warnMessage && message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `⚠️ ${message.author} ${config.warnMessage} *(récidive)*`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
        }
        break;

      case "timeout":
        if (member) {
          await member
            .timeout(10 * 60 * 1000, `Word filter (récidive): "${matchedWord}"`)
            .catch(() => {});
        }
        if (message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `🔇 ${message.author} a été mis en timeout (10min) pour récidive de langage inapproprié.`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
        }
        break;

      case "kick":
        if (member) {
          await member.kick(`Word filter (récidive): "${matchedWord}"`).catch(() => {});
        }
        if (message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `👢 ${message.author} a été expulsé pour récidive de langage inapproprié.`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
        }
        break;

      case "ban":
        await message.guild.bans
          .create(message.author, { reason: `Word filter (récidive): "${matchedWord}"` })
          .catch(() => {});
        if (message.channel.type === ChannelType.GuildText) {
          const warnMsg = await (message.channel as TextChannel).send(
            `🔨 ${message.author} a été banni pour récidive de langage inapproprié.`,
          );
          setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
        }
        break;
    }

    // Log sanction (récidive)
    if (logChannelId) {
      const logChannel = message.guild.channels.cache.get(logChannelId);
      if (logChannel?.isTextBased()) {
        await (logChannel as TextChannel).send({
          content: `🚫 **Filtre de mots (SANCTION)** — ${message.author.tag} (\`${userId}\`) dans <#${message.channelId}>`,
          embeds: [
            {
              title: "Mot interdit détecté (récidive — sanction)",
              fields: [
                { name: "Utilisateur", value: `${message.author} (\`${userId}\`)` },
                { name: "Salon", value: `<#${message.channelId}>` },
                { name: "Mot détecté", value: `\`${matchedWord}\`` },
                { name: "Action", value: action },
                { name: "Infractions (30min)", value: `${recentCount}` },
                { name: "Message (extrait)", value: message.content.slice(0, 500) || "(vide)" },
              ],
              color: 0xff3344,
              timestamp: new Date().toISOString(),
            },
          ],
        });
      }
    }

    logger.info(
      `[WordFilter] SANCTION ${message.author.tag} dans ${message.guild.name} — mot: "${matchedWord}" — action: ${action} — infractions: ${recentCount}`,
    );
  } catch (error) {
    logger.error("[WordFilter] Erreur enforcement:", error);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
