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
  analyticsInterval = safeInterval(
    "CommandAnalytics",
    () => sendAnalyticsReport(client),
    CHECK_INTERVAL_MS,
  );
}

async function sendAnalyticsReport(client: Client): Promise<void> {
  const channel = client.channels.cache.get(DASHBOARD_CHANNEL) as TextChannel;
  if (!channel?.isTextBased()) return;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const commandLogs = await prisma.commandLog.findMany({
      where: { timestamp: { gte: since } },
      select: { command: true },
    });
    const commandCounts = new Map<string, number>();
    for (const log of commandLogs) {
      commandCounts.set(log.command, (commandCounts.get(log.command) ?? 0) + 1);
    }
    const totalCommands = commandLogs.length;
    const topCommands = [...commandCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const errors = await prisma.errorMessage.count({ where: { createdAt: { gte: since } } });

    const guildCount = client.guilds.cache.size;
    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);

    const embed = new EmbedBuilder()
      .setTitle("Analytics — 24 h")
      .setColor(0x3ba55d)
      .addFields(
        { name: "Serveurs", value: `${guildCount}`, inline: true },
        { name: "Membres", value: `${totalMembers.toLocaleString("fr-FR")}`, inline: true },
        { name: "Slash 24 h", value: `${totalCommands}`, inline: true },
        { name: "Erreurs", value: `${errors}`, inline: true },
      )
      .setFooter({ text: "Analytics · fiche" })
      .setTimestamp();

    if (topCommands.length > 0) {
      embed.addFields({
        name: "Top slash",
        value: topCommands.map(([name, count]) => `/${name} — ${count}`).join("\n"),
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
