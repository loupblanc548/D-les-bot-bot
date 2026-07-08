/**
 * userSummary.ts — Génération de résumé utilisateur
 *
 * Agrège les données d'activité et de modération pour produire un profil.
 */

import { EmbedBuilder } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export interface UserSummary {
  userId: string;
  username: string;
  messageCount: number;
  topChannels: string[];
  sentimentTrend: "positive" | "neutral" | "negative";
  riskLevel: string;
  joinedAt: Date;
  lastActive: Date;
  achievements: string[];
}

export async function generateUserSummary(
  userId: string,
  guildId: string,
): Promise<UserSummary> {
  try {
    const [activityLogs, modActions] = await Promise.all([
      prisma.userActivityLog.findMany({
        where: { userId, guildId },
        orderBy: { createdAt: "desc" },
        take: 200,
      }).catch(() => []),
      prisma.modAction.findMany({
        where: { targetId: userId, guildId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }).catch(() => []),
    ]);

    const messageCount = activityLogs.length;
    const lastActive = activityLogs[0]?.createdAt ?? new Date();
    const joinedAt = activityLogs[activityLogs.length - 1]?.createdAt ?? new Date();

    // Top channels (extract from details field)
    const channelCounts: Record<string, number> = {};
    for (const log of activityLogs) {
      const channel = log.details ?? "unknown";
      channelCounts[channel] = (channelCounts[channel] ?? 0) + 1;
    }
    const topChannels = Object.entries(channelCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([ch]) => ch);

    // Sentiment trend (basic: count positive vs negative activities)
    const positiveKeywords = ["join", "level_up", "achievement", "help", "positive"];
    const negativeKeywords = ["warn", "mute", "kick", "ban", "toxic", "spam", "violation"];
    let positiveCount = 0;
    let negativeCount = 0;
    for (const log of activityLogs) {
      const activity = log.activity.toLowerCase();
      if (positiveKeywords.some((k) => activity.includes(k))) positiveCount++;
      if (negativeKeywords.some((k) => activity.includes(k))) negativeCount++;
    }
    const sentimentTrend: UserSummary["sentimentTrend"] =
      positiveCount > negativeCount * 2
        ? "positive"
        : negativeCount > positiveCount * 2
          ? "negative"
          : "neutral";

    // Risk level based on mod actions
    const sanctionCount = modActions.length;
    const riskLevel =
      sanctionCount === 0
        ? "FAIBLE"
        : sanctionCount <= 2
          ? "MOYEN"
          : sanctionCount <= 5
            ? "ÉLEVÉ"
            : "CRITIQUE";

    // Achievements
    const achievements: string[] = [];
    if (messageCount > 100) achievements.push("💬 Très actif (100+ activités)");
    if (messageCount > 500) achievements.push("🌟 Légende du serveur (500+ activités)");
    if (sanctionCount === 0) achievements.push("✅ Zéro sanction");
    if (sanctionCount === 0 && messageCount > 50) achievements.push("🏅 Citoyen modèle");
    if (positiveCount > 20) achievements.push("😊 Force positive");
    if (modActions.some((m) => m.action === "BAN")) achievements.push("⚠️ Déjà banni");

    return {
      userId,
      username: userId,
      messageCount,
      topChannels,
      sentimentTrend,
      riskLevel,
      joinedAt,
      lastActive,
      achievements,
    };
  } catch (error) {
    logger.error("[UserSummary] generateUserSummary:", String(error));
    return {
      userId,
      username: userId,
      messageCount: 0,
      topChannels: [],
      sentimentTrend: "neutral",
      riskLevel: "INCONNU",
      joinedAt: new Date(),
      lastActive: new Date(),
      achievements: [],
    };
  }
}

export async function generateUserEmbed(summary: UserSummary): Promise<EmbedBuilder> {
  const color =
    summary.riskLevel === "CRITIQUE"
      ? 0xe74c3c
      : summary.riskLevel === "ÉLEVÉ"
        ? 0xff8800
        : summary.riskLevel === "MOYEN"
          ? 0xf1c40f
          : 0x2ecc71;

  const sentimentEmoji =
    summary.sentimentTrend === "positive"
      ? "😊"
      : summary.sentimentTrend === "negative"
        ? "😠"
        : "😐";

  const embed = new EmbedBuilder()
    .setTitle(`📊 Profil — ${summary.username}`)
    .setColor(color)
    .addFields(
      { name: "📝 Activités", value: String(summary.messageCount), inline: true },
      { name: "⚠️ Niveau de risque", value: summary.riskLevel, inline: true },
      { name: `${sentimentEmoji} Tendance`, value: summary.sentimentTrend, inline: true },
      { name: "📅 Dernière activité", value: `<t:${Math.floor(summary.lastActive.getTime() / 1000)}:R>`, inline: true },
      { name: "📅 Première activité", value: `<t:${Math.floor(summary.joinedAt.getTime() / 1000)}:R>`, inline: true },
    )
    .setTimestamp();

  if (summary.topChannels.length > 0) {
    embed.addFields({
      name: "📍 Top channels",
      value: summary.topChannels.map((c, i) => `${i + 1}. ${c}`).join("\n"),
      inline: false,
    });
  }

  if (summary.achievements.length > 0) {
    embed.addFields({
      name: "🏆 Achievements",
      value: summary.achievements.join("\n"),
      inline: false,
    });
  }

  return embed;
}
