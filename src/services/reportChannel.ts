import { Client, TextChannel, EmbedBuilder, User, GuildMember } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// Salon de sécurité — fallback hardcoded si pas configuré en DB
const SECURITY_CHANNEL_FALLBACK = "1520866527753011220";

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
    const id = cfg?.reportChannelId || SECURITY_CHANNEL_FALLBACK;
    REPORT_CHANNEL_CACHE.set(guildId, { id, cachedAt: Date.now() });
    return id;
  } catch {
    return SECURITY_CHANNEL_FALLBACK;
  }
}

async function getUserReportChannelId(guildId: string): Promise<string | null> {
  const cached = USER_REPORT_CHANNEL_CACHE.get(guildId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.id;
  }
  try {
    const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
    const id = cfg?.userReportChannelId || cfg?.reportChannelId || SECURITY_CHANNEL_FALLBACK;
    USER_REPORT_CHANNEL_CACHE.set(guildId, { id, cachedAt: Date.now() });
    return id;
  } catch {
    return SECURITY_CHANNEL_FALLBACK;
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
  type: "AI_MODERATION" | "ANTI_PHISHING" | "ANTI_SPAM" | "USER_REPORT" | "SUSPICIOUS" | "ABUSE_FILTER" | "SPAM_DETECTOR" | "PERSPECTIVE_MOD";
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
    ABUSE_FILTER: { label: "Abuse Filter", emoji: "🔍", color: 0xe74c3c },
    SPAM_DETECTOR: { label: "Spam Detector ML", emoji: "🚨", color: 0xe67e22 },
    PERSPECTIVE_MOD: { label: "Perspective API", emoji: "📊", color: 0x9b59b6 },
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

// ─── Détection proactive de comportement suspect ──────────────────────

const recentJoinTimestamps: Map<string, number[]> = new Map();
const SUSPICIOUS_JOIN_THRESHOLD = 5; // 5 joins en 10 secondes = raid
const SUSPICIOUS_JOIN_WINDOW = 10_000;

/**
 * Détecte un rush de joins (potentiel raid) et alerte le salon de sécurité
 */
export async function checkSuspiciousJoin(client: Client, guildId: string): Promise<void> {
  const now = Date.now();
  let timestamps = recentJoinTimestamps.get(guildId) || [];
  timestamps = timestamps.filter((t) => now - t < SUSPICIOUS_JOIN_WINDOW);
  timestamps.push(now);
  recentJoinTimestamps.set(guildId, timestamps);

  if (timestamps.length >= SUSPICIOUS_JOIN_THRESHOLD) {
    recentJoinTimestamps.set(guildId, []);
    await sendSecurityAlert(client, {
      type: "SUSPICIOUS",
      userId: "SYSTEM",
      userTag: "Détection automatique",
      guildId,
      reason: `🚨 Rush de joins détecté — ${timestamps.length} membres en ${SUSPICIOUS_JOIN_WINDOW / 1000}s`,
      details: "Potentiel raid en cours. Vérifiez les nouveaux membres et activez le mode lockdown si nécessaire.",
    });
  }
}

/**
 * Détecte un compte suspect à l'arrivée (trop récent, pas d'avatar, etc.)
 */
export async function checkSuspiciousNewMember(client: Client, member: GuildMember): Promise<void> {
  const flags: string[] = [];
  const accountAgeHours = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);

  if (accountAgeHours < 24) flags.push("⚠️ Compte créé il y a moins de 24h");
  else if (accountAgeHours < 168) flags.push("⚠️ Compte créé il y a moins de 7 jours");

  if (!member.user.avatar) flags.push("👻 Aucun avatar personnalisé");
  if (member.user.bot && !member.user.flags?.has("VerifiedBot")) flags.push("🤖 Bot non vérifié");

  // Nom suspect (caractères spéciaux, zalgo, etc.)
  const username = member.user.username;
  if (/[\u0300-\u036F]/.test(username)) flags.push("🔤 Caractères diacritiques (zalgo?)");
  if (username.length < 3) flags.push("📝 Nom très court");
  if (/(discord|admin|moderator|staff|support|nitro|free|gift|steam)/i.test(username)) flags.push("🎭 Nom suspect (impersonation?)");

  if (flags.length === 0) return;

  await sendSecurityAlert(client, {
    type: "SUSPICIOUS",
    userId: member.id,
    userTag: member.user.tag,
    guildId: member.guild.id,
    reason: `Nouveau membre avec ${flags.length} flag(s) suspect(s)`,
    details: flags.join("\n"),
  });
}

/**
 * Détecte un spam de messages dans un salon
 */
const messageTimestamps: Map<string, number[]> = new Map();
const SPAM_THRESHOLD = 8; // 8 messages en 5 secondes
const SPAM_WINDOW = 5_000;

export async function checkMessageSpam(client: Client, userId: string, guildId: string, channelId: string, content: string): Promise<void> {
  const key = `${userId}:${channelId}`;
  const now = Date.now();
  let timestamps = messageTimestamps.get(key) || [];
  timestamps = timestamps.filter((t) => now - t < SPAM_WINDOW);
  timestamps.push(now);
  messageTimestamps.set(key, timestamps);

  if (timestamps.length >= SPAM_THRESHOLD) {
    messageTimestamps.set(key, []);
    await sendSecurityAlert(client, {
      type: "ANTI_SPAM",
      userId,
      userTag: `<@${userId}>`,
      guildId,
      reason: `🚫 Spam détecté — ${timestamps.length} messages en ${SPAM_WINDOW / 1000}s dans <#${channelId}>`,
      details: `Aperçu: ${content.substring(0, 200)}`,
    });
  }
}

/**
 * Envoie une alerte de comportement suspect personnalisée
 */
export async function alertSuspiciousBehavior(
  client: Client,
  guildId: string,
  userId: string,
  userTag: string,
  reason: string,
  details?: string,
): Promise<void> {
  await sendSecurityAlert(client, {
    type: "SUSPICIOUS",
    userId,
    userTag,
    guildId,
    reason,
    details,
  });
}
