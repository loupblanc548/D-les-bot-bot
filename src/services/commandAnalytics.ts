import { Client, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import prisma from "../prisma.js";

const DASHBOARD_CHANNEL = process.env.ANALYTICS_DASHBOARD_CHANNEL || "";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let analyticsInterval: NodeJS.Timeout | null = null;

export function startCommandAnalytics(client: Client): void {
  if (analyticsInterval) return;
  if (!DASHBOARD_CHANNEL) {
    logger.info("[Analytics] Dashboard désactivé (ANALYTICS_DASHBOARD_CHANNEL vide)");
    return;
  }

  logger.info("[Analytics] Dashboard analytique activé (intervalle: 24h)");
  analyticsInterval = safeInterval("CommandAnalytics", () => sendAnalyticsReport(client), CHECK_INTERVAL_MS);
}

async function sendAnalyticsReport(client: Client): Promise<void> {
  const channel = client.channels.cache.get(DASHBOARD_CHANNEL) as TextChannel;
  if (!channel?.isTextBased()) return;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const topCommands = await prisma.notification.findMany({
      where: { sentAt: { gte: since } },
      select: { platform: true, content: true },
      take: 100,
      orderBy: { sentAt: "desc" },
    }).catch(() => []);

    const commandCounts = new Map<string, number>();
    for (const notif of topCommands) {
      const cmd = notif.platform;
      commandCounts.set(cmd, (commandCounts.get(cmd) ?? 0) + 1);
    }

    const totalNotifications = topCommands.length;
    const topPlatforms = [...commandCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    const guildCount = client.guilds.cache.size;
    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);

    const embed = new EmbedBuilder()
      .setTitle("📊 Analytics — Rapport 24h")
      .setColor(0x00aaff)
      .addFields(
        { name: "Serveurs", value: `${guildCount}`, inline: true },
        { name: "Membres totaux", value: `${totalMembers.toLocaleString()}`, inline: true },
        { name: "Notifications 24h", value: `${totalNotifications}`, inline: true },
      )
      .setFooter({ text: "Surveillance System • Command Analytics" })
      .setTimestamp();

    if (topPlatforms.length > 0) {
      embed.addFields({
        name: "Top plateformes",
        value: topPlatforms.map(([platform, count]) => `**${platform}**: ${count} notif(s)`).join("\n"),
        inline: false,
      });
    }

    await channel.send({ embeds: [embed] });
    logger.info("[Analytics] Rapport envoyé");
  } catch (err) {
    logger.error(`[Analytics] Erreur: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function stopCommandAnalytics(): void {
  if (analyticsInterval) {
    clearInterval(analyticsInterval);
    analyticsInterval = null;
  }
}
