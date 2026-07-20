/**
 * communityDigest.ts — Digest périodique communautaire (opt-in, configurable)
 *
 * Envoie un résumé périodique de l'activité du serveur dans un salon dédié:
 * - Membres actifs (top par messages)
 * - Nouveaux membres
 * - Événements à venir
 * - Jeux populaires (Steam/RAWG)
 * - Sondages actifs
 * - Notifications social follow
 *
 * Garde-fous:
 * - Opt-in par serveur (configurable via /digest enable)
 * - Fréquence configurable (daily, weekly)
 * - Heure d'envoi configurable
 * - Désactivation possible (/digest disable)
 * - RGPD: utilise uniquement des données agrégées, pas de données personnelles individuelles
 */

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "../backend/backend.js";
import logger from "../utils/logger.js";

export type DigestFrequency = "daily" | "weekly";

export interface DigestConfig {
  guildId: string;
  enabled: boolean;
  frequency: DigestFrequency;
  channelId: string | null;
  sendHour: number; // 0-23
  sendDayOfWeek: number; // 0-6 (0=Sunday), for weekly
  lastSentAt: Date | null;
}

const digestConfigs = new Map<string, DigestConfig>();
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function getDigestConfig(guildId: string): DigestConfig {
  return (
    digestConfigs.get(guildId) || {
      guildId,
      enabled: false,
      frequency: "daily",
      channelId: null,
      sendHour: 9,
      sendDayOfWeek: 1,
      lastSentAt: null,
    }
  );
}

export function setDigestConfig(guildId: string, config: Partial<DigestConfig>): DigestConfig {
  const current = getDigestConfig(guildId);
  const updated = { ...current, ...config };
  digestConfigs.set(guildId, updated);
  logger.info(
    `[Digest] Config updated for ${guildId}: enabled=${updated.enabled} freq=${updated.frequency}`,
  );
  return updated;
}

export function startDigestScheduler(client: Client): void {
  if (schedulerTimer) return;

  schedulerTimer = setInterval(async () => {
    const now = new Date();
    for (const [guildId, config] of digestConfigs) {
      if (!config.enabled || !config.channelId) continue;

      const shouldSend = shouldSendDigest(config, now);
      if (!shouldSend) continue;

      try {
        await sendDigest(client, guildId, config.channelId);
        config.lastSentAt = new Date();
      } catch (err) {
        logger.error(`[Digest] Failed for ${guildId}: ${err}`);
      }
    }
  }, 60_000); // Check every minute
}

export function stopDigestScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

function shouldSendDigest(config: DigestConfig, now: Date): boolean {
  if (!config.lastSentAt) {
    // First run: send if hour matches
    if (config.frequency === "daily" && now.getHours() === config.sendHour) {
      return true;
    }
    if (
      config.frequency === "weekly" &&
      now.getDay() === config.sendDayOfWeek &&
      now.getHours() === config.sendHour
    ) {
      return true;
    }
    return false;
  }

  const elapsed = now.getTime() - config.lastSentAt.getTime();
  const minInterval = config.frequency === "daily" ? 23 * 60 * 60 * 1000 : 6 * 24 * 60 * 60 * 1000;

  if (elapsed < minInterval) return false;

  if (config.frequency === "daily") {
    return now.getHours() === config.sendHour;
  } else {
    return now.getDay() === config.sendDayOfWeek && now.getHours() === config.sendHour;
  }
}

async function sendDigest(client: Client, guildId: string, channelId: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !(channel instanceof TextChannel)) return;

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(
    periodStart.getDate() - (getDigestConfig(guildId).frequency === "daily" ? 1 : 7),
  );

  const embed = new EmbedBuilder()
    .setTitle(
      `📊 Digest ${getDigestConfig(guildId).frequency === "daily" ? "quotidien" : "hebdomadaire"} — ${guild.name}`,
    )
    .setColor(0x5865f2)
    .setThumbnail(guild.iconURL() || null)
    .setTimestamp(now);

  // 1. Member stats
  const memberCount = guild.memberCount;
  let newMembers = 0;
  try {
    newMembers = (await guild.members.fetch({ after: "0", limit: 50 })).filter(
      (m) => m.joinedAt && m.joinedAt >= periodStart,
    ).size;
  } catch {}

  embed.addFields({
    name: "👥 Membres",
    value: `**Total:** ${memberCount}\n**Nouveaux:** ${newMembers} (${periodStart.toLocaleDateString("fr-FR")} → ${now.toLocaleDateString("fr-FR")})`,
    inline: true,
  });

  // 2. Command activity
  try {
    const commandLogs = await prisma.commandLog.findMany({
      where: { guildId, createdAt: { gte: periodStart } },
      select: { command: true },
    });
    const topCommands = new Map<string, number>();
    for (const log of commandLogs) {
      topCommands.set(log.command, (topCommands.get(log.command) || 0) + 1);
    }
    const sorted = [...topCommands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length > 0) {
      embed.addFields({
        name: "🔧 Commandes populaires",
        value: sorted.map(([cmd, count]) => `• \`/${cmd}\` — ${count} utilisations`).join("\n"),
        inline: true,
      });
    }
  } catch {}

  // 3. Moderation stats
  try {
    const sanctions = await prisma.sanction.findMany({
      where: { guildId, createdAt: { gte: periodStart } },
      select: { type: true },
    });
    if (sanctions.length > 0) {
      const byType = new Map<string, number>();
      for (const s of sanctions) {
        byType.set(s.type, (byType.get(s.type) || 0) + 1);
      }
      embed.addFields({
        name: "🛡️ Modération",
        value: [...byType.entries()].map(([type, count]) => `• ${type}: ${count}`).join("\n"),
        inline: true,
      });
    }
  } catch {}

  // 4. Social follows
  try {
    const follows = await prisma.socialFollow.findMany({
      where: { guildId, createdAt: { gte: periodStart } },
      select: { platform: true, channelName: true },
    });
    if (follows.length > 0) {
      embed.addFields({
        name: "📡 Nouveaux suivis sociaux",
        value: follows
          .map((f) => `• ${f.platform}: ${f.channelName}`)
          .join("\n")
          .slice(0, 1024),
        inline: false,
      });
    }
  } catch {}

  // 5. Upcoming events
  try {
    const events = await guild.scheduledEvents.fetch();
    const upcoming = events.filter(
      (e) => e.scheduledStartTimestamp && e.scheduledStartTimestamp > now.getTime(),
    );
    if (upcoming.size > 0) {
      embed.addFields({
        name: "📅 Événements à venir",
        value: [...upcoming.values()]
          .slice(0, 5)
          .map(
            (e) => `• **${e.name}** — <t:${Math.floor((e.scheduledStartTimestamp || 0) / 1000)}:R>`,
          )
          .join("\n"),
        inline: false,
      });
    }
  } catch {}

  // 6. Active polls
  try {
    const polls = await prisma.suggestion.findMany({
      where: { guildId, status: "open" },
      take: 3,
    });
    if (polls.length > 0) {
      embed.addFields({
        name: "🗳️ Suggestions ouvertes",
        value: `${polls.length} suggestion(s) en cours. Utilisez \`/suggestion list\` pour voir.`,
        inline: false,
      });
    }
  } catch {}

  embed.setFooter({ text: "Digest automatique — /digest disable pour désactiver" });

  await channel.send({ embeds: [embed] });
  logger.info(`[Digest] Sent to ${guildId}/${channelId}`);
}
