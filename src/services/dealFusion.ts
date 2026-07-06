import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { dedupCache } from "../utils/deduplicationCache.js";

interface DealInfo {
  gameName: string;
  platform: string;
  price: number;
  url: string;
  source: string;
  timestamp: number;
}

const recentDeals: Map<string, DealInfo[]> = new Map();
const FUSION_WINDOW_MS = 5 * 60 * 1000;

export function trackDeal(deal: DealInfo): void {
  const key = deal.gameName.toLowerCase().trim();
  const list = recentDeals.get(key) ?? [];
  list.push(deal);
  recentDeals.set(key, list);

  if (list.length >= 2) {
    const now = Date.now();
    const recent = list.filter((d) => now - d.timestamp < FUSION_WINDOW_MS);
    if (recent.length >= 2) {
      void fusionDeals(recent);
    }
  }

  if (recentDeals.size > 500) {
    const oldest = recentDeals.keys().next().value;
    if (oldest) recentDeals.delete(oldest);
  }
}

async function fusionDeals(deals: DealInfo[]): Promise<void> {
  const sorted = [...deals].sort((a, b) => a.price - b.price);
  const cheapest = sorted[0];
  const gameName = cheapest.gameName;

  const dedupKey = `deal-fusion:${gameName.toLowerCase()}`;
  if (dedupCache.isAlreadyProcessed("deals", dedupKey)) return;

  const channel = globalClient?.channels.cache.get(config.dealsChannel || config.steamEpicChannel || "") as TextChannel;
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(`💰 Comparaison de deals — ${gameName}`)
    .setColor(0x00ff00)
    .setDescription(`**Meilleur prix: ${cheapest.price.toFixed(2)}€ sur ${cheapest.source}**`)
    .setFooter({ text: "Surveillance System • Cross-Platform Deal Fusion" })
    .setTimestamp();

  for (const deal of sorted) {
    embed.addFields({
      name: deal.source,
      value: `**${deal.price.toFixed(2)}€** sur ${deal.platform}\n[Lien](${deal.url})`,
      inline: true,
    });
  }

  try {
    await channel.send({ embeds: [embed] });
    await dedupCache.markAsProcessed("deals", dedupKey);
    logger.info(`[DealFusion] Deals fusionnés pour "${gameName}" — ${sorted.length} source(s)`);
  } catch (err) {
    logger.error(`[DealFusion] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
  }
}

let globalClient: Client | null = null;

export function startDealFusion(client: Client): void {
  globalClient = client;
  logger.info("[DealFusion] Fusion de deals cross-plateforme activée");
}
