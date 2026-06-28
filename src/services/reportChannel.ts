import { Client, TextChannel, EmbedBuilder, User } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const REPORT_CHANNEL_CACHE = new Map<string, { id: string | null; cachedAt: number }>();
const USER_REPORT_CHANNEL_CACHE = new Map<string, { id: string | null; cachedAt: number }>();
const CACHE_TTL = 60_000;

async function getReportChannelId(guildId: string): Promise<string | null> {
  const cached = REPORT_CHANNEL_CACHE.get(guildId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.id;
  }
  try {
    const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
    const id = cfg?.reportChannelId || null;
    REPORT_CHANNEL_CACHE.set(guildId, { id, cachedAt: Date.now() });
    return id;
  } catch {
    return null;
  }
}

async function getUserReportChannelId(guildId: string): Promise<string | null> {
  const cached = USER_REPORT_CHANNEL_CACHE.get(guildId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.id;
  }
  try {
    const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
    const id = cfg?.userReportChannelId || cfg?.reportChannelId || null;
    USER_REPORT_CHANNEL_CACHE.set(guildId, { id, cachedAt: Date.now() });
    return id;
  } catch {
    return null;
  }
}

export function clearReportChannelCache(): void {
  REPORT_CHANNEL_CACHE.clear();
  USER_REPORT_CHANNEL_CACHE.clear();
}

export async function setReportChannel(guildId: string, channelId: string | null): Promise<void> {
  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, reportChannelId: channelId },
    update: { reportChannelId: channelId },
  });
  clearReportChannelCache();
}

export async function setUserReportChannel(guildId: string, channelId: string | null): Promise<void> {
  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, userReportChannelId: channelId },
    update: { userReportChannelId: channelId },
  });
  clearReportChannelCache();
}

export interface SecurityAlert {
  type: "AI_MODERATION" | "ANTI_PHISHING" | "ANTI_SPAM" | "USER_REPORT" | "SUSPICIOUS";
  userId: string;
  userTag: string;
  guildId: string;
  reason: string;
  details?: string;
  messageContent?: string;
  messageUrl?: string;
}

const REPORT_ROLE_ID = "1402362014264983762";

export async function sendSecurityAlert(client: Client, alert: SecurityAlert): Promise<void> {
  try {
    const channelId = await getReportChannelId(alert.guildId);
    if (!channelId) return;

    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel) {
      const fetched = await client.channels.fetch(channelId).catch(() => null);
      if (!fetched || !fetched.isTextBased()) return;
      return void (await (fetched as TextChannel).send({ content: `<@&${REPORT_ROLE_ID}>`, embeds: [buildAlertEmbed(alert)] }));
    }

    await channel.send({ content: `<@&${REPORT_ROLE_ID}>`, embeds: [buildAlertEmbed(alert)] });
  } catch (err) {
    logger.error("[ReportChannel] Erreur envoi alerte:", err);
  }
}

function buildAlertEmbed(alert: SecurityAlert): EmbedBuilder {
  const typeLabels: Record<SecurityAlert["type"], { label: string; emoji: string; color: number }> = {
    AI_MODERATION: { label: "IA Modération", emoji: "🤖", color: 0xff6b6b },
    ANTI_PHISHING: { label: "Anti-Phishing", emoji: "🛡️", color: 0xff4444 },
    ANTI_SPAM: { label: "Anti-Spam", emoji: "🚫", color: 0xff9500 },
    USER_REPORT: { label: "Signalement Utilisateur", emoji: "📢", color: 0x3498db },
    SUSPICIOUS: { label: "Activité Suspecte", emoji: "⚠️", color: 0xf39c12 },
  };

  const info = typeLabels[alert.type];
  const embed = new EmbedBuilder()
    .setTitle(`${info.emoji} ${info.label}`)
    .setColor(info.color)
    .addFields(
      { name: "Utilisateur", value: `<@${alert.userId}> (${alert.userTag})`, inline: true },
      { name: "Raison", value: alert.reason, inline: false },
    )
    .setTimestamp();

  if (alert.details) {
    embed.addFields({ name: "Détails", value: alert.details.slice(0, 1024), inline: false });
  }
  if (alert.messageContent) {
    embed.addFields({ name: "Message", value: alert.messageContent.slice(0, 1024) || "[vide]", inline: false });
  }
  if (alert.messageUrl) {
    embed.addFields({ name: "Lien", value: alert.messageUrl, inline: false });
  }

  return embed;
}

export async function sendUserReport(
  client: Client,
  guildId: string,
  reporter: User,
  target: User | null,
  reason: string,
  messageUrl?: string,
): Promise<void> {
  try {
    const channelId = await getUserReportChannelId(guildId);
    if (!channelId) return;

    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    let targetChannel: TextChannel | null = channel || null;
    if (!targetChannel) {
      const fetched = await client.channels.fetch(channelId).catch(() => null);
      if (fetched && fetched.isTextBased()) targetChannel = fetched as TextChannel;
    }
    if (!targetChannel) return;

    const embed = new EmbedBuilder()
      .setTitle("📢 Signalement Utilisateur")
      .setColor(0x3498db)
      .addFields(
        { name: "Signalé par", value: `<@${reporter.id}> (${reporter.tag})`, inline: true },
        { name: "Utilisateur signalé", value: target ? `<@${target.id}> (${target.tag})` : "N/A", inline: true },
        { name: "Raison", value: reason.slice(0, 1024), inline: false },
      )
      .setTimestamp();

    if (messageUrl) {
      embed.addFields({ name: "Lien du message", value: messageUrl, inline: false });
    }

    await targetChannel.send({ content: `<@&${REPORT_ROLE_ID}>`, embeds: [embed] });
  } catch (err) {
    logger.error("[ReportChannel] Erreur envoi signalement utilisateur:", err);
  }
}
