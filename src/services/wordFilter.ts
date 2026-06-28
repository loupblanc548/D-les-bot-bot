/**
 * wordFilter.ts — Filtre de mots interdits automatique et configurable par serveur
 *
 * Système gradué à 4 niveaux (fenêtre de 1 minute) :
 *   1ère infraction → suppression silencieuse (rien)
 *   2ème infraction → avertissement (DM + log)
 *   3ème infraction → ban temporaire / timeout 10min (DM + log)
 *   4ème infraction → ban permanent (DM + log)
 *
 * Stockage : Prisma (WordFilterConfig + WordFilterEntry + WordFilterInfraction)
 */

import { Message, TextChannel, PermissionFlagsBits, ChannelType, Client } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const INFRACTION_WINDOW_MINUTES = 1;

// Cache en mémoire : guildId → { words: Set, config: WordFilterConfig }
interface FilterCache {
  words: Set<string>;
  compiledRegexes: RegExp[];
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
    compiledRegexes: entries.map(
      (e) => new RegExp(`\\b${escapeRegex(e.word.toLowerCase())}\\b`, "i"),
    ),
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

  const { words, compiledRegexes, config } = await loadCache(message.guild.id);
  if (!config?.enabled || words.size === 0) return null;

  const content = message.content.toLowerCase();

  // Vérification avec les regex pré-compilées du cache
  for (let i = 0; i < compiledRegexes.length; i++) {
    if (compiledRegexes[i].test(content)) {
      return [...words][i];
    }
  }

  return null;
}

/**
 * Applique l'action sur un message contenant un mot interdit.
 * Système gradué à 4 niveaux (fenêtre de 1 minute) :
 *   1 → suppression silencieuse
 *   2 → avertissement (DM + log)
 *   3 → timeout 10min (DM + log)
 *   4 → ban permanent (DM + log)
 */
export async function enforceFilter(message: Message, matchedWord: string): Promise<void> {
  if (!message.guild) return;

  const { config } = await loadCache(message.guild.id);
  if (!config) return;

  const member = message.member;
  const logChannelId = config.logChannel;
  const guildId = message.guild.id;
  const userId = message.author.id;
  const guildName = message.guild.name;

  try {
    // ── Enregistrer l'infraction ──
    await prisma.wordFilterInfraction.create({
      data: { guildId, userId, word: matchedWord },
    });

    // ── Compter les infractions dans la fenêtre de 1 minute ──
    const since = new Date(Date.now() - INFRACTION_WINDOW_MINUTES * 60 * 1000);
    const recentCount = await prisma.wordFilterInfraction.count({
      where: { guildId, userId, createdAt: { gte: since } },
    });

    // ── Supprimer le message dans tous les cas ──
    await message.delete().catch(() => {});

    // ── Niveau 1 : suppression silencieuse, rien d'autre ──
    if (recentCount === 1) {
      logger.info(
        `[WordFilter] ${message.author.tag} dans ${guildName} — mot: "${matchedWord}" (1er — silencieux)`,
      );
      return;
    }

    // ── Niveau 2 : avertissement ──
    if (recentCount === 2) {
      const warnText = `⚠️ **Avertissement** — Sur le serveur **${guildName}**, tu as utilisé un langage inapproprié ("${matchedWord}"). C'est ton 2ème message filtré en moins d'une minute. À la prochaine, ce sera un ban temporaire.`;

      // DM à l'utilisateur
      await sendDM(message.client, message.author.id, warnText);

      // Message dans le salon
      if (message.channel.type === ChannelType.GuildText) {
        const warnMsg = await (message.channel as TextChannel).send(
          `⚠️ ${message.author} avertissement pour langage inapproprié. *(prochaine fois = ban temporaire)*`,
        );
        setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
      }

      // Log
      await sendLog(
        message,
        logChannelId,
        matchedWord,
        "Avertissement (2ème)",
        recentCount,
        0xffaa00,
      );
      logger.info(
        `[WordFilter] AVERT. ${message.author.tag} dans ${guildName} — mot: "${matchedWord}" — infractions: ${recentCount}`,
      );
      return;
    }

    // ── Niveau 3 : ban temporaire (timeout 10min) ──
    if (recentCount === 3) {
      const dmText = `🔇 **Ban temporaire (10 minutes)** — Sur le serveur **${guildName}**, tu as continué à utiliser un langage inapproprié malgré l'avertissement. Tu es maintenant en timeout. Une dernière récidive entraînera un **ban permanent**.`;

      // DM
      await sendDM(message.client, message.author.id, dmText);

      // Timeout
      if (member) {
        await member
          .timeout(10 * 60 * 1000, `Word filter (3ème infraction): "${matchedWord}"`)
          .catch(() => {});
      }

      // Message dans le salon
      if (message.channel.type === ChannelType.GuildText) {
        const warnMsg = await (message.channel as TextChannel).send(
          `🔇 ${message.author} a été mis en timeout (10min) pour récidive. *(prochaine fois = ban permanent)*`,
        );
        setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
      }

      // Log
      await sendLog(
        message,
        logChannelId,
        matchedWord,
        "Timeout 10min (3ème)",
        recentCount,
        0xff6600,
      );
      logger.info(
        `[WordFilter] TIMEOUT ${message.author.tag} dans ${guildName} — mot: "${matchedWord}" — infractions: ${recentCount}`,
      );
      return;
    }

    // ── Niveau 4+ : ban permanent ──
    const dmText = `🔨 **Ban permanent** — Sur le serveur **${guildName}**, tu as ignoré les avertissements et continué à utiliser un langage inapproprié. Tu as été banni définitivement.`;

    // DM (avant le ban sinon impossible)
    await sendDM(message.client, message.author.id, dmText);

    // Ban
    await message.guild.bans
      .create(message.author, {
        reason: `Word filter (4ème+ infraction): "${matchedWord}"`,
      })
      .catch(() => {});

    // Message dans le salon
    if (message.channel.type === ChannelType.GuildText) {
      const warnMsg = await (message.channel as TextChannel).send(
        `� ${message.author} a été **banni définitivement** pour récidive de langage inapproprié.`,
      );
      setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
    }

    // Log
    await sendLog(
      message,
      logChannelId,
      matchedWord,
      "Ban permanent (4ème+)",
      recentCount,
      0xff3344,
    );
    logger.info(
      `[WordFilter] BAN PERMA ${message.author.tag} dans ${guildName} — mot: "${matchedWord}" — infractions: ${recentCount}`,
    );
  } catch (error) {
    logger.error("[WordFilter] Erreur enforcement:", error);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function sendDM(client: Client, userId: string, content: string): Promise<void> {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
      await user.send(content).catch(() => {});
    }
  } catch {
    // DM peut échouer (MP fermés)
  }
}

async function sendLog(
  message: Message,
  logChannelId: string | null,
  matchedWord: string,
  actionLabel: string,
  infractionCount: number,
  color: number,
): Promise<void> {
  if (!logChannelId || !message.guild) return;
  const logChannel = message.guild.channels.cache.get(logChannelId);
  if (!logChannel?.isTextBased()) return;

  await (logChannel as TextChannel).send({
    content: `🚫 **Filtre de mots** — ${message.author.tag} (\`${message.author.id}\`) dans <#${message.channelId}>`,
    embeds: [
      {
        title: `Mot interdit — ${actionLabel}`,
        fields: [
          { name: "Utilisateur", value: `${message.author} (\`${message.author.id}\`)` },
          { name: "Salon", value: `<#${message.channelId}>` },
          { name: "Mot détecté", value: `\`${matchedWord}\`` },
          { name: "Action", value: actionLabel },
          { name: "Infractions (1min)", value: `${infractionCount}` },
          { name: "Message (extrait)", value: message.content.slice(0, 500) || "(vide)" },
        ],
        color,
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
