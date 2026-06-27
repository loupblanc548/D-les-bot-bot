/**
 * welcomeGoodbye.ts — Service de bienvenue/départ configurable
 *
 * Variables disponibles dans les messages :
 *   {user}      — mention du membre
 *   {username}  — nom d'utilisateur (sans tag)
 *   {tag}       — tag complet (username#discriminator)
 *   {server}    — nom du serveur
 *   {count}     — nombre de membres
 *
 * Image de bienvenue : générée via Canvas (carte avec avatar + pseudo)
 */

import { GuildMember, TextChannel, EmbedBuilder, AttachmentBuilder, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Remplacement des variables ────────────────────────────────────────────────

export function replaceVariables(text: string, member: GuildMember): string {
  const replacements: Record<string, string> = {
    "{user}": member.toString(),
    "{username}": member.user.username,
    "{tag}": member.user.tag,
    "{server}": member.guild.name,
    "{count}": `${member.guild.memberCount}`,
  };

  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value);
  }
  return result;
}

// ─── Envoi du message de bienvenue ─────────────────────────────────────────────

export async function sendWelcomeMessage(member: GuildMember): Promise<void> {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config?.enabled || !config.channelId) return;

  const channel = member.guild.channels.cache.get(config.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  try {
    const content = replaceVariables(config.message, member);
    const color = parseInt(config.color, 16);

    const embed = new EmbedBuilder()
      .setTitle(replaceVariables(config.title, member))
      .setColor(color)
      .setDescription(content)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "👤 Membre", value: member.user.tag, inline: true },
        { name: "📊 Membres", value: `${member.guild.memberCount}`, inline: true },
        {
          name: "📅 Compte créé",
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
      )
      .setTimestamp();

    // Image de bienvenue si activée
    if (config.useImage) {
      const imageBuffer = await generateWelcomeImage(member);
      if (imageBuffer) {
        const attachment = new AttachmentBuilder(imageBuffer, { name: "welcome.png" });
        embed.setImage("attachment://welcome.png");
        await (channel as TextChannel).send({ embeds: [embed], files: [attachment] });
      } else {
        // Fallback sans image
        if (config.imageUrl) embed.setImage(config.imageUrl);
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    } else {
      if (config.imageUrl) embed.setImage(config.imageUrl);
      await (channel as TextChannel).send({ embeds: [embed] });
    }

    logger.info(`[Welcome] Message envoyé pour ${member.user.tag} dans ${member.guild.name}`);
  } catch (error) {
    logger.error("[Welcome] Erreur envoi:", error);
  }
}

// ─── Envoi du message de départ ────────────────────────────────────────────────

export async function sendGoodbyeMessage(member: GuildMember): Promise<void> {
  const config = await prisma.goodbyeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config?.enabled || !config.channelId) return;

  const channel = member.guild.channels.cache.get(config.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  try {
    const content = replaceVariables(config.message, member);
    const color = parseInt(config.color, 16);

    const embed = new EmbedBuilder()
      .setTitle(replaceVariables(config.title, member))
      .setColor(color)
      .setDescription(content)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "👤 Membre", value: member.user.tag, inline: true },
        { name: "📊 Membres restants", value: `${member.guild.memberCount}`, inline: true },
      )
      .setTimestamp();

    await (channel as TextChannel).send({ embeds: [embed] });
    logger.info(`[Goodbye] Message envoyé pour ${member.user.tag} dans ${member.guild.name}`);
  } catch (error) {
    logger.error("[Goodbye] Erreur envoi:", error);
  }
}

// ─── Génération d'image de bienvenue ───────────────────────────────────────────

async function generateWelcomeImage(member: GuildMember): Promise<Buffer | null> {
  try {
    // Utiliser l'API d'image de bienvenue (Welcomer/REST)
    // On génère une URL avec les paramètres du membre
    const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
    const username = encodeURIComponent(member.user.username);
    const serverName = encodeURIComponent(member.guild.name);
    const memberCount = member.guild.memberCount;

    // Utiliser l'API gratuite Welcomer
    const url = `https://api.popcat.xyz/welcomecard?background=https://cdn.discordapp.com/attachments/850013049860321302/850013411558101062/bg.png&text1=${username}&text2=Welcome+to+${serverName}&text3=Member+${memberCount}&avatar=${avatarUrl}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn(`[Welcome] API image HTTP ${res.status}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error("[Welcome] Erreur génération image:", error);
    return null;
  }
}
