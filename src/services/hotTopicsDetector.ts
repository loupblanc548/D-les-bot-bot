import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let hotTopicsInterval: NodeJS.Timeout | null = null;

const PLATFORM_CHANNELS: Record<
  string,
  { channelId: string; keywords: string[]; label: string; color: number }
> = {
  steam: {
    channelId: config.steamEpicChannel,
    keywords: ["steam", "valve", "cs2", "csgo", "dota", "tf2", "gmod", "pc gaming"],
    label: "Steam/Epic",
    color: 0x1b2838,
  },
  playstation: {
    channelId: config.playstationChannel,
    keywords: ["playstation", "ps5", "ps4", "sony", "spider-man", "god of war", "horizon"],
    label: "PlayStation",
    color: 0x003791,
  },
  xbox: {
    channelId: config.xboxChannel,
    keywords: ["xbox", "game pass", "microsoft", "halo", "forza", "fable", "sega"],
    label: "Xbox",
    color: 0x107c10,
  },
  nintendo: {
    channelId: config.nintendoChannel,
    keywords: ["nintendo", "switch", "mario", "zelda", "pokemon", "smash", "metroid"],
    label: "Nintendo",
    color: 0xe60012,
  },
  fortnite: {
    channelId: config.fortniteChannel,
    keywords: ["fortnite", "epic", "battle royale", "zero build", "creative"],
    label: "Fortnite",
    color: 0x9147ff,
  },
  deals: {
    channelId: config.dealsChannel,
    keywords: ["deal", "promo", "soldes", "discount", "reduction", "gratuit", "free"],
    label: "Deals",
    color: 0xffaa00,
  },
};

interface TopicStat {
  keyword: string;
  count: number;
  platform: string;
  sampleMessages: string[];
}

async function analyzeChannelMessages(
  channel: TextChannel,
  platform: string,
  keywords: string[],
): Promise<TopicStat[]> {
  const stats: TopicStat[] = [];
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const keywordCounts = new Map<string, { count: number; samples: string[] }>();

    for (const msg of messages) {
      const content = msg[1].content.toLowerCase();
      if (msg[1].author.bot) continue;

      for (const kw of keywords) {
        if (content.includes(kw)) {
          const existing = keywordCounts.get(kw) ?? { count: 0, samples: [] };
          existing.count++;
          if (existing.samples.length < 3) {
            existing.samples.push(msg[1].content.substring(0, 100));
          }
          keywordCounts.set(kw, existing);
        }
      }
    }

    for (const [keyword, data] of keywordCounts) {
      if (data.count >= 3) {
        stats.push({ keyword, count: data.count, platform, sampleMessages: data.samples });
      }
    }
  } catch (err) {
    logger.debug(
      `[HotTopics] Erreur analyse ${channel.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return stats.sort((a, b) => b.count - a.count);
}

async function checkHotTopics(client: Client): Promise<void> {
  for (const [platformKey, platformCfg] of Object.entries(PLATFORM_CHANNELS)) {
    if (!platformCfg.channelId) continue;

    const channel = client.channels.cache.get(platformCfg.channelId) as TextChannel;
    if (!channel?.isTextBased()) continue;

    const stats = await analyzeChannelMessages(channel, platformKey, platformCfg.keywords);
    if (stats.length === 0) continue;

    const topTopics = stats.slice(0, 5);
    const embed = new EmbedBuilder()
      .setTitle(`🔥 Sujets chauds — ${platformCfg.label}`)
      .setColor(platformCfg.color)
      .setDescription("Top des sujets les plus discutés dans les dernières 100 messages")
      .setFooter({ text: `Surveillance System • Hot Topics • ${platformCfg.label}` })
      .setTimestamp();

    for (const topic of topTopics) {
      embed.addFields({
        name: `#${topic.keyword} (${topic.count} mentions)`,
        value:
          topic.sampleMessages
            .map((s) => `> ${s}`)
            .join("\n")
            .substring(0, 1024) || "—",
        inline: false,
      });
    }

    try {
      await channel.send({ embeds: [embed] });
      logger.info(
        `[HotTopics] Rapport envoyé pour ${platformCfg.label} — ${topTopics.length} sujet(s) chaud(s)`,
      );
    } catch (err) {
      logger.error(`[HotTopics] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function startHotTopicsDetector(client: Client): void {
  if (hotTopicsInterval) return;
  logger.info(
    "[HotTopics] Détecteur de sujets chauds activé (intervalle: 1h) — routing par plateforme",
  );
  hotTopicsInterval = safeInterval("HotTopics", () => checkHotTopics(client), CHECK_INTERVAL_MS);
}

export function stopHotTopicsDetector(): void {
  if (hotTopicsInterval) {
    clearInterval(hotTopicsInterval);
    hotTopicsInterval = null;
  }
}
