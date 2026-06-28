/**
 * autoModeration.ts — Filtres d'auto-modération automatiques
 *
 * Fonctionnalités (event-driven, aucune commande slash) :
 * - EVENT-02: Word blacklist (mots interdits → auto-delete + warn)
 * - EVENT-04: Anti-caps (> X% majuscules → auto-delete)
 * - EVENT-05: Anti-emoji spam (> N emojis → auto-delete)
 * - EVENT-07: File type filter (extensions interdites → auto-delete)
 * - EVENT-10: Mass mention guard (> N mentions → auto-block + warn)
 * - EVENT-19: Slowmode auto (> X msg/min → active slowmode)
 */

import { Client, GuildMember, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { recordSecurityEvent } from "../services/risk-engine.js";
import { createLog } from "../services/logs.js";
import prisma from "../prisma.js";

// ─── Constantes ──────────────────────────────────────────────────────────────

const CAPS_THRESHOLD = 0.7; // 70% de majuscules
const CAPS_MIN_LENGTH = 20; // minimum 20 chars pour vérifier
const EMOJI_SPAM_THRESHOLD = 15; // max 15 emojis par message
const MASS_MENTION_THRESHOLD = 5; // max 5 mentions par message
const SLOWMODE_MSG_PER_MIN = 20; // seuil d'activation slowmode
const SLOWMODE_DURATION = 10; // 10 secondes

// ─── State ───────────────────────────────────────────────────────────────────

const channelMsgTracker = new Map<string, { count: number; windowStart: number }>();

// ─── Word blacklist cache ────────────────────────────────────────────────────

let wordBlacklistCache: string[] | null = null;
let wordBlacklistExpiry = 0;

async function getWordBlacklist(guildId: string): Promise<string[]> {
  const now = Date.now();
  if (wordBlacklistCache && now < wordBlacklistExpiry) return wordBlacklistCache;

  try {
    const setting = await prisma.setting.findFirst({
      where: { guildId, key: "wordBlacklist" },
    });
    const words = setting?.value ? (JSON.parse(setting.value) as string[]) : [];
    wordBlacklistCache = words;
    wordBlacklistExpiry = now + 60_000;
    return wordBlacklistCache;
  } catch {
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCapsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Zà-ÿÀ-Ÿ]/g, "");
  if (letters.length < CAPS_MIN_LENGTH) return 0;
  const upper = letters.replace(/[^A-ZÀ-Ÿ]/g, "");
  return upper.length / letters.length;
}

function countEmojis(text: string): number {
  const emojiRegex = /\p{Extended_Pictographic}/gu;
  return (text.match(emojiRegex) || []).length;
}

function getBlockedExtensions(): string[] {
  const env = process.env.BLOCKED_EXTENSIONS;
  if (!env) return [".exe", ".bat", ".cmd", ".scr", ".jar", ".apk", ".msi", ".com", ".pif"];
  return env.split(",").map((e) => e.trim().toLowerCase());
}

// ─── Main handler ────────────────────────────────────────────────────────────

export function handleAutoModeration(client: Client): void {
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!("member" in message) || !message.member) return;

      const member = message.member as GuildMember;
      if (member.permissions.has("Administrator") || member.permissions.has("ModerateMembers"))
        return;

      const content = message.content;
      const guildId = message.guild.id;

      // ── 1. Word blacklist ──────────────────────────────────────────────
      const blacklist = await getWordBlacklist(guildId);
      if (blacklist.length > 0) {
        const lowerContent = content.toLowerCase();
        const matchedWord = blacklist.find((w) => lowerContent.includes(w.toLowerCase()));
        if (matchedWord) {
          await message.delete().catch(() => {});
          const alert = await message.channel.send({
            content: `⚠️ ${message.author}, mot interdit détecté. Merci de rester respectueux.`,
          });
          setTimeout(() => alert.delete().catch(() => {}), 8000);
          await recordSecurityEvent(message.author.id, guildId, "ANTI_SPAM").catch(() => {});
          await createLog({
            type: "automod",
            action: `Mot interdit par ${message.author.tag}: "${matchedWord}"`,
            userId: message.author.id,
            details: content.slice(0, 200),
          });
          logger.info(`[AutoMod] Word blacklist: ${message.author.tag} — "${matchedWord}"`);
          return;
        }
      }

      // ── 2. Anti-caps ───────────────────────────────────────────────────
      if (content.length >= CAPS_MIN_LENGTH) {
        const capsRatio = getCapsRatio(content);
        if (capsRatio >= CAPS_THRESHOLD) {
          await message.delete().catch(() => {});
          const alert = await message.channel.send({
            content: `⚠️ ${message.author}, évite les MAJUSCULES excessives.`,
          });
          setTimeout(() => alert.delete().catch(() => {}), 5000);
          logger.debug(
            `[AutoMod] Anti-caps: ${message.author.tag} (${Math.round(capsRatio * 100)}%)`,
          );
          return;
        }
      }

      // ── 3. Anti-emoji spam ─────────────────────────────────────────────
      const emojiCount = countEmojis(content);
      if (emojiCount >= EMOJI_SPAM_THRESHOLD) {
        await message.delete().catch(() => {});
        const alert = await message.channel.send({
          content: `⚠️ ${message.author}, trop d'emojis dans ton message.`,
        });
        setTimeout(() => alert.delete().catch(() => {}), 5000);
        logger.debug(`[AutoMod] Emoji spam: ${message.author.tag} (${emojiCount} emojis)`);
        return;
      }

      // ── 4. Mass mention guard ──────────────────────────────────────────
      const mentionCount = message.mentions.users.size + message.mentions.roles.size;
      if (mentionCount >= MASS_MENTION_THRESHOLD) {
        await message.delete().catch(() => {});
        const alert = await message.channel.send({
          content: `⚠️ ${message.author}, les mentions de masse sont interdites.`,
        });
        setTimeout(() => alert.delete().catch(() => {}), 8000);
        await recordSecurityEvent(message.author.id, guildId, "ANTI_SPAM").catch(() => {});
        await createLog({
          type: "automod",
          action: `Mass mention par ${message.author.tag} (${mentionCount} mentions)`,
          userId: message.author.id,
        });
        logger.info(`[AutoMod] Mass mention: ${message.author.tag} (${mentionCount} mentions)`);
        return;
      }

      // ── 5. File type filter ────────────────────────────────────────────
      if (message.attachments.size > 0) {
        const blocked = getBlockedExtensions();
        for (const [, attachment] of message.attachments) {
          const ext = attachment.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
          if (blocked.includes(ext)) {
            await message.delete().catch(() => {});
            const alert = await message.channel.send({
              content: `⚠️ ${message.author}, les fichiers \`${ext}\` sont interdits.`,
            });
            setTimeout(() => alert.delete().catch(() => {}), 8000);
            await recordSecurityEvent(message.author.id, guildId, "ANTI_SPAM").catch(() => {});
            logger.info(`[AutoMod] Blocked file: ${message.author.tag} — ${ext}`);
            return;
          }
        }
      }

      // ── 6. Slowmode auto ───────────────────────────────────────────────
      const channelId = message.channel.id;
      const now = Date.now();
      const tracker = channelMsgTracker.get(channelId);
      if (!tracker || now - tracker.windowStart > 60_000) {
        channelMsgTracker.set(channelId, { count: 1, windowStart: now });
      } else {
        tracker.count++;
        if (tracker.count >= SLOWMODE_MSG_PER_MIN) {
          const channel = message.channel as TextChannel;
          if (channel.rateLimitPerUser < SLOWMODE_DURATION) {
            try {
              await channel.setRateLimitPerUser(
                SLOWMODE_DURATION,
                "Auto slowmode — activité élevée détectée",
              );
              logger.info(
                `[AutoMod] Slowmode auto activé sur #${channel.name} (${tracker.count} msg/min)`,
              );
              const alert = await channel.send({
                content: `🐌 Slowmode automatique activé (${SLOWMODE_DURATION}s) — activité élevée détectée.`,
              });
              setTimeout(() => alert.delete().catch(() => {}), 15000);
            } catch {
              // Permissions insuffisantes
            }
          }
          // Reset après activation
          channelMsgTracker.set(channelId, { count: 0, windowStart: now });
        }
      }
    } catch (error) {
      logger.error("[AutoMod] Erreur:", error);
    }
  });

  // Cleanup périodique du tracker slowmode
  const _slowmodeCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of channelMsgTracker) {
      if (now - val.windowStart > 120_000) channelMsgTracker.delete(key);
    }
  }, 60_000);
  if (_slowmodeCleanup.unref) _slowmodeCleanup.unref();

  logger.info(
    "[AutoMod] Filtres d'auto-modération activés (word blacklist, caps, emoji, mentions, files, slowmode)",
  );
}
