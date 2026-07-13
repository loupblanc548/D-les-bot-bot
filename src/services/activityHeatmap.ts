import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let heatmapInterval: NodeJS.Timeout | null = null;

interface HourlyActivity {
  hour: number;
  count: number;
}

async function generateActivityHeatmap(client: Client): Promise<void> {
  const targetChannelId = config.logChannel || "";
  if (!targetChannelId) return;

  const channel = client.channels.cache.get(targetChannelId) as TextChannel;
  if (!channel?.isTextBased()) return;

  const hourlyData: HourlyActivity[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: 0,
  }));
  const dailyData: Record<string, number> = {
    Mon: 0,
    Tue: 0,
    Wed: 0,
    Thu: 0,
    Fri: 0,
    Sat: 0,
    Sun: 0,
  };
  const channelActivity = new Map<string, number>();

  try {
    for (const guild of client.guilds.cache.values()) {
      const channels = guild.channels.cache.filter((c) => c.isTextBased()) as Map<
        string,
        TextChannel
      >;
      for (const [_chId, ch] of channels) {
        try {
          const messages = await ch.messages.fetch({ limit: 50 });
          for (const msg of messages) {
            const date = new Date(msg[1].createdTimestamp);
            const hour = date.getHours();
            const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];

            hourlyData[hour].count++;
            dailyData[day]++;
            channelActivity.set(ch.name, (channelActivity.get(ch.name) ?? 0) + 1);
          }
        } catch {}
      }
    }
  } catch (err) {
    logger.error(`[Heatmap] Erreur collecte: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const maxHourly = Math.max(...hourlyData.map((h) => h.count), 1);
  const maxDaily = Math.max(...Object.values(dailyData), 1);

  const heatmapBars = "▁▂▃▄▅▆▇█";
  const hourlyBar = hourlyData
    .map((h) => {
      const idx = Math.floor((h.count / maxHourly) * (heatmapBars.length - 1));
      return heatmapBars[idx];
    })
    .join("");

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dailyBar = dayNames
    .map((d) => {
      const idx = Math.floor((dailyData[d] / maxDaily) * (heatmapBars.length - 1));
      return heatmapBars[idx];
    })
    .join("");

  const topChannels = [...channelActivity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle("📊 Heatmap d'activité du serveur (24h)")
    .setColor(0x00aaff)
    .addFields(
      {
        name: "Activité par heure (0h→23h)",
        value: `\`${hourlyBar}\`\n\`0h     6h     12h    18h    23h\``,
        inline: false,
      },
      {
        name: "Activité par jour (Lun→Dim)",
        value: `\`${dailyBar}\`\n\`Lun Mar Mer Jeu Ven Sam Dim\``,
        inline: false,
      },
    )
    .setFooter({ text: "Surveillance System • Activity Heatmap" })
    .setTimestamp();

  if (topChannels.length > 0) {
    embed.addFields({
      name: "Top 10 salons actifs",
      value: topChannels
        .map(([name, count]) => `**#${name}**: ${count} messages`)
        .join("\n")
        .substring(0, 1024),
      inline: false,
    });
  }

  const peakHour = hourlyData.reduce((max, h) => (h.count > max.count ? h : max), hourlyData[0]);
  if (peakHour.count > 0) {
    embed.addFields({
      name: "Heure de pointe",
      value: `**${peakHour.hour}h00** (${peakHour.count} messages) — meilleur moment pour les annonces`,
      inline: false,
    });
  }

  try {
    await channel.send({ embeds: [embed] });
    logger.info("[Heatmap] Rapport d'activité envoyé");
  } catch (err) {
    logger.error(`[Heatmap] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startActivityHeatmap(client: Client): void {
  if (heatmapInterval) return;
  logger.info("[Heatmap] Heatmap d'activité activée (intervalle: 24h)");
  heatmapInterval = safeInterval(
    "ActivityHeatmap",
    () => generateActivityHeatmap(client),
    CHECK_INTERVAL_MS,
  );
}

export function stopActivityHeatmap(): void {
  if (heatmapInterval) {
    clearInterval(heatmapInterval);
    heatmapInterval = null;
  }
}
