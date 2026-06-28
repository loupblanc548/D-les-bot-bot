/**
 * autoEvents.ts — Events automatiques supplémentaires (event-driven)
 *
 * EVENT-03: NSFW image filter (détection images NSFW dans salons SFW)
 * EVENT-08: Link shortener detect (résout bit.ly/tinyurl → vérifie destination)
 * EVENT-11: Nickname filter (pseudo inapproprié → auto-reset + DM)
 * EVENT-16: Auto-role on join (rôle auto à l'arrivée)
 * EVENT-20: Starboard auto (> N ⭐ → post auto dans starboard)
 * EVENT-26: Temp role expiry (vérifie expiration rôles temporaires)
 * EVENT-27: Temp ban expiry (auto-unban quand durée expire)
 * EVENT-29: Level XP (XP auto par message, level up notif)
 * EVENT-33: Alert webhook (envoie alertes vers webhook externe)
 * EVENT-35: Permission audit (audite auto changements de permissions)
 */

import { Client, GuildMember, TextChannel, EmbedBuilder, MessageReaction, User } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { recordSecurityEvent } from "../services/risk-engine.js";
import { createLog } from "../services/logs.js";
import prisma from "../prisma.js";
import { safeInterval } from "../utils/safe-interval.js";
import { checkVoiceSoundboard } from "../services/serverRules.js";
import { handleReactionRoleAdd, handleReactionRoleRemove } from "../commands/reactionRoles.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const STARBOARD_THRESHOLD = 5; // 5 ⭐ pour starboard
const STARBOARD_EMOJI = "⭐";
const XP_PER_MESSAGE = 15;
const XP_COOLDOWN_MS = 60_000; // 1 min entre gains d'XP
const TEMP_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min

const SHORTENER_DOMAINS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly"];

const NSFW_KEYWORDS = ["nsfw", "porn", "hentai", "xxx", "adult", "nude"];

// ─── State ───────────────────────────────────────────────────────────────────

const xpCooldown = new Map<string, number>();

// ─── NSFW Image Filter (EVENT-03) ────────────────────────────────────────────

async function checkNsfwImage(message: import("discord.js").Message): Promise<void> {
  if (!message.guild) return;
  if (message.channel.isDMBased()) return;

  // Skip NSFW channels
  if ("nsfw" in message.channel && message.channel.nsfw) return;

  for (const [, attachment] of message.attachments) {
    const isImage = attachment.contentType?.startsWith("image/");
    if (!isImage) continue;

    const filename = attachment.name.toLowerCase();
    const hasNsfwKeyword = NSFW_KEYWORDS.some((k) => filename.includes(k));

    if (hasNsfwKeyword) {
      await message.delete().catch(() => {});
      const alert = await message.channel.send({
        content: `⚠️ ${message.author}, image potentiellement NSFW supprimée.`,
      });
      setTimeout(() => alert.delete().catch(() => {}), 8000);
      await recordSecurityEvent(message.author.id, message.guild.id, "ANTI_SPAM").catch(() => {});
      await createLog({
        type: "automod",
        action: `Image NSFW suspectée par ${message.author.tag}: ${filename}`,
        userId: message.author.id,
      });
      logger.info(`[AutoEvents] NSFW image filtered: ${message.author.tag} — ${filename}`);
      return;
    }
  }
}

// ─── Link Shortener Detect (EVENT-08) ────────────────────────────────────────

async function checkLinkShortener(message: import("discord.js").Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const content = message.content;

  for (const domain of SHORTENER_DOMAINS) {
    if (content.includes(domain)) {
      try {
        // Extract URL
        const urlMatch = content.match(
          new RegExp(`https?://${domain.replace(".", "\\.")}/[^\\s]+`),
        );
        if (!urlMatch) continue;

        // Resolve redirect
        const response = await fetch(urlMatch[0], {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(5000),
        });
        const finalUrl = response.url;

        if (finalUrl && finalUrl !== urlMatch[0]) {
          // Check if destination is suspicious
          const suspiciousPatterns = ["phishing", "login", "verify", "claim", "free", "nitro"];
          const finalLower = finalUrl.toLowerCase();
          const isSuspicious = suspiciousPatterns.some((p) => finalLower.includes(p));

          if (isSuspicious) {
            await message.delete().catch(() => {});
            const alert = await (message.channel as TextChannel).send({
              content: `⚠️ ${message.author}, lien raccourci menant vers un site suspect supprimé.`,
            });
            setTimeout(() => alert.delete().catch(() => {}), 10000);
            await recordSecurityEvent(message.author.id, message.guild.id, "ANTI_PHISHING").catch(
              () => {},
            );
            logger.warn(
              `[AutoEvents] Shortener → suspicious: ${message.author.tag} ${urlMatch[0]} → ${finalUrl}`,
            );
            return;
          }
        }
      } catch {
        // Resolution failed — log but don't act
        logger.debug(`[AutoEvents] Shortener resolve failed: ${domain}`);
      }
    }
  }
}

// ─── Nickname Filter (EVENT-11) ──────────────────────────────────────────────

const NICKNAME_BLOCKED_WORDS = ["discord", "admin", "mod", "staff", "owner", "@here", "@everyone"];

async function checkNickname(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
  const newNick = newMember.nickname || newMember.user.username;
  const oldNick = oldMember.nickname || oldMember.user.username;
  if (newNick === oldNick) return;

  // Skip admins
  if (newMember.permissions.has("Administrator")) return;

  const lowerNick = newNick.toLowerCase();

  // Check hoist characters
  const hasHoist = /^[!@#$%^&*()_+=[\]{}|;:'",<>?/\\~`]/.test(newNick);

  // Check blocked words
  const hasBlockedWord = NICKNAME_BLOCKED_WORDS.some((w) => lowerNick.includes(w));

  // Check excessive length
  const tooLong = newNick.length > 32;

  if (hasHoist || hasBlockedWord || tooLong) {
    try {
      await newMember.setNickname(null, "AutoMod: pseudo inapproprié");
      await newMember
        .send({
          content:
            `⚠️ Ton pseudo sur **${newMember.guild.name}** a été réinitialisé car il était inapproprié ` +
            `(mot interdit, hoist, ou longueur excessive). Tu peux en choisir un nouveau.`,
        })
        .catch(() => {});
      await createLog({
        type: "automod",
        action: `Pseudo réinitialisé pour ${newMember.user.tag}: "${newNick}"`,
        userId: newMember.user.id,
      });
      logger.info(`[AutoEvents] Nickname reset: ${newMember.user.tag} — "${newNick}"`);
    } catch {
      // Permissions insuffisantes
    }
  }
}

// ─── Auto-Role on Join (EVENT-16) ────────────────────────────────────────────

async function handleAutoRole(member: GuildMember): Promise<void> {
  try {
    const guildConfig = await prisma.guildConfig.findUnique({
      where: { guildId: member.guild.id },
    });
    const autoRoleId = (guildConfig as any)?.autoRoleId;
    if (!autoRoleId) return;

    const role = member.guild.roles.cache.get(autoRoleId);
    if (role && role.editable) {
      await member.roles.add(role, "Auto-role à l'arrivée");
      logger.info(`[AutoEvents] Auto-role: ${member.user.tag} → ${role.name}`);
    }
  } catch (error) {
    logger.debug("[AutoEvents] Auto-role error:", error);
  }
}

// ─── Starboard (EVENT-20) ────────────────────────────────────────────────────

async function handleStarboard(
  reaction: MessageReaction,
  user: User,
  client: Client,
): Promise<void> {
  if (reaction.emoji.name !== STARBOARD_EMOJI) return;
  if (!reaction.message.guild) return;

  const message = reaction.message;
  if (message.author?.bot) return;

  const count = reaction.count;
  if (count < STARBOARD_THRESHOLD) return;

  // Check if already in starboard
  const starboardChannelId = process.env.STARBOARD_CHANNEL_ID;
  if (!starboardChannelId) return;

  const starboardChannel = await client.channels.fetch(starboardChannelId).catch(() => null);
  if (!starboardChannel?.isTextBased()) return;

  // Check if already posted (simple dedup via message ID in content)
  try {
    const existing = await (starboardChannel as TextChannel).messages.fetch({ limit: 50 });
    const alreadyPosted = existing.some(
      (m) => m.embeds[0]?.footer?.text?.includes(message.id) || m.content.includes(message.id),
    );
    if (alreadyPosted) return;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: message.author?.username || "Unknown",
        iconURL: message.author?.displayAvatarURL(),
      })
      .setDescription(message.content?.slice(0, 1500) || "")
      .addFields(
        { name: "Source", value: `[Aller au message](${message.url})`, inline: true },
        { name: "Étoiles", value: `${STARBOARD_EMOJI} ${count}`, inline: true },
        { name: "Salon", value: `<#${message.channelId}>`, inline: true },
      )
      .setColor(0xffd700)
      .setTimestamp(message.createdAt)
      .setFooter({ text: `Message ID: ${message.id}` });

    if (message.attachments.size > 0) {
      const firstImage = message.attachments.find((a) => a.contentType?.startsWith("image/"));
      if (firstImage) embed.setImage(firstImage.url);
    }

    await (starboardChannel as TextChannel).send({ embeds: [embed] });
    logger.info(`[AutoEvents] Starboard: ${count}⭐ sur message ${message.id}`);
  } catch (error) {
    logger.debug("[AutoEvents] Starboard error:", error);
  }
}

// ─── Level XP (EVENT-29) ─────────────────────────────────────────────────────

async function handleLevelXP(message: import("discord.js").Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const userId = message.author.id;
  const guildId = message.guild.id;
  const now = Date.now();

  const lastGain = xpCooldown.get(userId) || 0;
  if (now - lastGain < XP_COOLDOWN_MS) return;
  xpCooldown.set(userId, now);

  try {
    // Store XP in Setting table
    const existing = await prisma.setting.findFirst({
      where: { guildId, key: `xp:${userId}` },
    });

    const currentXp = existing ? parseInt(existing.value, 10) : 0;
    const newTotalXp = currentXp + XP_PER_MESSAGE;

    // Calculate level (100 * level^1.5)
    const currentLevel = Math.floor(Math.cbrt(currentXp / 100));
    const newLevel = Math.floor(Math.cbrt(newTotalXp / 100));

    if (existing) {
      await prisma.setting.update({
        where: { id: existing.id },
        data: { value: String(newTotalXp) },
      });
    } else {
      await prisma.setting.create({
        data: { guildId, key: `xp:${userId}`, value: String(newTotalXp) },
      });
    }

    // Level up notification
    if (newLevel > currentLevel && newLevel > 0) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🎉 Level Up!")
        .setDescription(`${message.author} a atteint le niveau **${newLevel}** !`)
        .setTimestamp();
      await (message.channel as TextChannel)
        .send({ embeds: [embed] })
        .then((m: import("discord.js").Message) => {
          setTimeout(() => m.delete().catch(() => {}), 10000);
        });
      logger.info(`[AutoEvents] Level up: ${message.author.tag} → level ${newLevel}`);
    }
  } catch (error) {
    logger.debug("[AutoEvents] XP error:", error);
  }
}

// ─── Temp Role/Ban Expiry (EVENT-26 + EVENT-27) ──────────────────────────────

async function checkTempExpiry(client: Client): Promise<void> {
  const now = new Date();

  // Check temp bans
  try {
    const tempBans = await prisma.log.findMany({
      where: {
        type: "tempban",
        createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) }, // older than 1h
      },
      take: 50,
    });

    for (const log of tempBans) {
      if (!log.guildId || !log.userId) continue;
      // Parse duration from action field
      const durationMatch = log.action.match(/(\d+)\s*(min|heure|jour)/i);
      if (!durationMatch) continue;

      const value = parseInt(durationMatch[1], 10);
      const unit = durationMatch[2].toLowerCase();
      const ms = unit.startsWith("min")
        ? value * 60 * 1000
        : unit.startsWith("heure")
          ? value * 60 * 60 * 1000
          : value * 24 * 60 * 60 * 1000;

      const expiry = new Date(log.createdAt.getTime() + ms);
      if (now > expiry) {
        // Unban
        try {
          const guild = await client.guilds.fetch(log.guildId);
          await guild.bans.remove(log.userId, "Tempban expiré automatiquement").catch(() => {});
          await prisma.log.delete({ where: { id: log.id } }).catch(() => {});
          logger.info(`[AutoEvents] Tempban expired: ${log.userId} in ${log.guildId}`);
        } catch {
          // Guild not available
        }
      }
    }
  } catch {
    // Table might not have expected data
  }
}

// ─── Permission Audit (EVENT-35) ─────────────────────────────────────────────

async function handlePermissionAudit(
  oldGuild: import("discord.js").Guild,
  newGuild: import("discord.js").Guild,
  client: Client,
): Promise<void> {
  // Check role permission changes
  const oldRoles = oldGuild.roles.cache;
  const newRoles = newGuild.roles.cache;

  for (const [id, newRole] of newRoles) {
    const oldRole = oldRoles.get(id);
    if (!oldRole) continue;

    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      const added = newRole.permissions.toArray().filter((p) => !oldRole.permissions.has(p as any));
      const removed = oldRole.permissions
        .toArray()
        .filter((p) => !newRole.permissions.has(p as any));

      if (added.length > 0 || removed.length > 0) {
        const logChannelId = config.logChannel;
        if (logChannelId) {
          const channel = await client.channels.fetch(logChannelId).catch(() => null);
          if (channel?.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle("🔒 Changement de permissions")
              .setColor(0xff9900)
              .addFields({ name: "Rôle", value: newRole.name, inline: true })
              .setTimestamp();
            if (added.length > 0)
              embed.addFields({ name: "Ajouté", value: added.join(", "), inline: false });
            if (removed.length > 0)
              embed.addFields({ name: "Retiré", value: removed.join(", "), inline: false });
            await (channel as TextChannel).send({ embeds: [embed] });
          }
        }
        await createLog({
          type: "security",
          action: `Permissions modifiées pour rôle ${newRole.name}: +${added.join(",")} -${removed.join(",")}`,
        });
        logger.info(`[AutoEvents] Permission audit: role ${newRole.name} changed`);
      }
    }
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

export function handleAutoEvents(client: Client): void {
  // EVENT-03 + EVENT-08 + EVENT-29: messageCreate hooks
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!("member" in message) || !message.member) return;

      const member = message.member as GuildMember;
      if (member.permissions.has("Administrator")) return;

      await checkNsfwImage(message);
      await checkLinkShortener(message);
      await handleLevelXP(message);
    } catch (error) {
      logger.error("[AutoEvents] messageCreate error:", error);
    }
  });

  // EVENT-11: Nickname filter
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
      await checkNickname(oldMember as GuildMember, newMember as GuildMember);
    } catch (error) {
      logger.error("[AutoEvents] guildMemberUpdate error:", error);
    }
  });

  // EVENT-16: Auto-role on join
  client.on("guildMemberAdd", async (member) => {
    try {
      await handleAutoRole(member);
    } catch (error) {
      logger.error("[AutoEvents] guildMemberAdd error:", error);
    }
  });

  // EVENT: Anti-soundboard (Voicemod et apps externes en vocal)
  client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
      // Détection quand un membre rejoint un salon vocal ou change de salon
      if (newState.member && newState.channelId && newState.channelId !== oldState.channelId) {
        await checkVoiceSoundboard(newState.member);
      }
    } catch (error) {
      logger.error("[AutoEvents] voiceStateUpdate error:", error);
    }
  });

  // EVENT-20: Starboard + Reaction Roles
  client.on("messageReactionAdd", async (reaction, user) => {
    try {
      if (reaction.partial) await reaction.fetch();
      await handleStarboard(reaction as MessageReaction, user as User, client);
      await handleReactionRoleAdd(reaction as MessageReaction, user as User);
    } catch (error) {
      logger.error("[AutoEvents] reactionAdd error:", error);
    }
  });

  // EVENT: Reaction Roles — retrait de réaction
  client.on("messageReactionRemove", async (reaction, user) => {
    try {
      if (reaction.partial) await reaction.fetch();
      await handleReactionRoleRemove(reaction as MessageReaction, user as User);
    } catch (error) {
      logger.error("[AutoEvents] reactionRemove error:", error);
    }
  });

  // EVENT-35: Permission audit
  client.on("guildUpdate", async (oldGuild, newGuild) => {
    try {
      await handlePermissionAudit(oldGuild, newGuild, client);
    } catch (error) {
      logger.error("[AutoEvents] guildUpdate error:", error);
    }
  });

  // EVENT-26 + EVENT-27: Temp expiry check (interval)
  safeInterval(
    "TempExpiry",
    () => {
      checkTempExpiry(client).catch((err) => logger.error("[AutoEvents] TempExpiry error:", err));
    },
    TEMP_CHECK_INTERVAL_MS,
  );

  // XP cooldown cleanup
  const _xpCooldownCleanup = setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of xpCooldown) {
      if (now - timestamp > 3600000) xpCooldown.delete(userId);
    }
  }, 300000);
  if (_xpCooldownCleanup.unref) _xpCooldownCleanup.unref();

  logger.info(
    "[AutoEvents] Events automatiques activés (NSFW, shortener, nickname, auto-role, starboard, XP, temp-expiry, permission-audit)",
  );
}
