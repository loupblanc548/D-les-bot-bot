/**
 * autoReact.ts — Auto-react service
 *
 * Permet au bot de réagir automatiquement aux messages
 * selon des règles configurables par serveur :
 * - keyword : réagit si le message contient un mot-clé
 * - regex   : réagit si le message match une regex
 * - always  : réagit à tous les messages d'un salon
 *
 * Stockage : Prisma (AutoReactRule)
 */

import { Message } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

interface CachedRule {
  id: string;
  channelId: string | null;
  trigger: string;
  emoji: string;
  matchType: string;
  enabled: boolean;
}

const cache = new Map<string, CachedRule[]>();
const cacheTimestamps = new Map<string, number>();
const CACHE_TTL = 60_000;

async function loadRules(guildId: string): Promise<CachedRule[]> {
  const now = Date.now();
  const ts = cacheTimestamps.get(guildId);
  if (ts && now - ts < CACHE_TTL && cache.has(guildId)) {
    return cache.get(guildId)!;
  }

  const rules = await prisma.autoReactRule.findMany({
    where: { guildId, enabled: true },
    select: {
      id: true,
      channelId: true,
      trigger: true,
      emoji: true,
      matchType: true,
      enabled: true,
    },
  });

  const result: CachedRule[] = rules.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    trigger: r.trigger,
    emoji: r.emoji,
    matchType: r.matchType,
    enabled: r.enabled,
  }));

  cache.set(guildId, result);
  cacheTimestamps.set(guildId, now);
  return result;
}

function invalidateCache(guildId: string): void {
  cache.delete(guildId);
  cacheTimestamps.delete(guildId);
}

function matchesRule(content: string, rule: CachedRule): boolean {
  const text = content.toLowerCase();
  switch (rule.matchType) {
    case "keyword":
      return text.includes(rule.trigger.toLowerCase());
    case "regex":
      try {
        return new RegExp(rule.trigger, "i").test(content);
      } catch {
        return false;
      }
    case "always":
      return true;
    default:
      return false;
  }
}

export async function processAutoReact(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  try {
    const rules = await loadRules(message.guild.id);
    if (rules.length === 0) return;

    const channelRules = rules.filter(
      (r) => r.channelId === null || r.channelId === message.channelId,
    );

    const matchedEmojis = new Set<string>();
    for (const rule of channelRules) {
      if (matchesRule(message.content, rule)) {
        matchedEmojis.add(rule.emoji);
      }
    }

    if (matchedEmojis.size === 0) return;

    for (const emoji of matchedEmojis) {
      try {
        await message.react(emoji);
      } catch {
        logger.debug(`[AutoReact] Emoji invalide ou bloqué: ${emoji}`);
      }
    }
  } catch (error) {
    logger.error("[AutoReact] Erreur:", error);
  }
}

export async function addRule(
  guildId: string,
  trigger: string,
  emoji: string,
  matchType: string = "keyword",
  channelId: string | null = null,
): Promise<void> {
  await prisma.autoReactRule.create({
    data: { guildId, trigger, emoji, matchType, channelId },
  });
  invalidateCache(guildId);
}

export async function removeRule(guildId: string, ruleId: string): Promise<boolean> {
  const result = await prisma.autoReactRule.deleteMany({
    where: { id: ruleId, guildId },
  });
  if (result.count > 0) {
    invalidateCache(guildId);
    return true;
  }
  return false;
}

export async function listRules(guildId: string) {
  return prisma.autoReactRule.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
  });
}

export async function toggleRule(guildId: string, ruleId: string, enabled: boolean): Promise<boolean> {
  const result = await prisma.autoReactRule.updateMany({
    where: { id: ruleId, guildId },
    data: { enabled },
  });
  if (result.count > 0) {
    invalidateCache(guildId);
    return true;
  }
  return false;
}

export async function clearRules(guildId: string): Promise<number> {
  const result = await prisma.autoReactRule.deleteMany({
    where: { guildId },
  });
  invalidateCache(guildId);
  return result.count;
}
