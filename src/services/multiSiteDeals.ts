/**
 * multiSiteDeals.ts — Monitor deals across multiple gaming stores.
 *
 * Checks Steam, GOG, Humble Bundle, Green Man Gaming, Fanatical
 * for discounts and posts them to the free games channel.
 * Auto-translates to French.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { translateAutoToFrench } from "../utils/translator.js";

const CHECK_INTERVAL_MS = parseInt(process.env.MULTI_SITE_DEALS_INTERVAL_MS || "900000", 10); // 15 min
let dealsInterval: NodeJS.Timeout | null = null;

interface Deal {
  title: string;
  originalPrice: string;
  discountedPrice: string;
  discountPercent: number;
  url: string;
  store: string;
  image?: string;
  endDate?: string;
}

const STORE_CONFIGS = [
  { name: "Steam", emoji: "🎮", color: 0x1b2838, url: "https://store.steampowered.com/api/featuredcategories" },
  { name: "GOG", emoji: "💿", color: 0x5c2d91, url: "https://www.gog.com/games/ajax/filtered?mediaType=game&search=&sort=popularity&page=1" },
  { name: "Humble Bundle", emoji: "🤝", color: 0xcccccc, url: "https://www.humblebundle.com/store/api/search?sort=discount&page=1&request=1" },
  { name: "Green Man Gaming", emoji: "🟢", color: 0x00aa00, url: "https://www.greenmangaming.com/api/products?pageSize=20&onSale=true" },
  { name: "Fanatical", emoji: "🔥", color: 0xff6600, url: "https://www.fanatical.com/api/products?onSale=true&pageSize=20" },
];

async function fetchSteamDeals(): Promise<Deal[]> {
  const deals: Deal[] = [];
  try {
    const res = await fetch("https://store.steampowered.com/api/featuredcategories", {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return deals;
    const data = await res.json() as Record<string, unknown>;

    // Special offers
    const specials = data.specials as { items: Array<{ id: number; name: string; discount_block?: string; discount_original_price?: number; discount_final_price?: number; header_image?: string; url?: string }> } | undefined;
    if (specials?.items) {
      for (const item of specials.items.slice(0, 10)) {
        const originalPrice = item.discount_original_price ? (item.discount_original_price / 100).toFixed(2) + "€" : "N/A";
        const finalPrice = item.discount_final_price ? (item.discount_final_price / 100).toFixed(2) + "€" : "N/A";
        const discountMatch = item.discount_block?.match(/(\d+)%/);
        const discountPercent = discountMatch ? parseInt(discountMatch[1], 10) : 0;

        if (discountPercent >= 50) {
          deals.push({
            title: item.name,
            originalPrice,
            discountedPrice: finalPrice,
            discountPercent,
            url: item.url || `https://store.steampowered.com/app/${item.id}`,
            store: "Steam",
            image: item.header_image,
          });
        }
      }
    }
  } catch (err) {
    logger.debug(`[MultiSiteDeals] Steam fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return deals;
}

async function fetchGOGDeals(): Promise<Deal[]> {
  const deals: Deal[] = [];
  try {
    const res = await fetch("https://www.gog.com/games/ajax/filtered?mediaType=game&search=&sort=popularity&page=1", {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return deals;
    const data = await res.json() as { products: Array<{ title: string; price: { baseAmount: string; finalAmount: string; discountPercentage: number }; url: string; image: string }> };
    if (!data.products) return deals;

    for (const product of data.products.slice(0, 10)) {
      if (product.price?.discountPercentage >= 50) {
        deals.push({
          title: product.title,
          originalPrice: product.price.baseAmount ? parseFloat(product.price.baseAmount).toFixed(2) + "€" : "N/A",
          discountedPrice: product.price.finalAmount ? parseFloat(product.price.finalAmount).toFixed(2) + "€" : "GRATUIT",
          discountPercent: product.price.discountPercentage,
          url: `https://www.gog.com${product.url}`,
          store: "GOG",
          image: product.image,
        });
      }
    }
  } catch (err) {
    logger.debug(`[MultiSiteDeals] GOG fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return deals;
}

async function fetchHumbleDeals(): Promise<Deal[]> {
  const deals: Deal[] = [];
  try {
    const res = await fetch("https://www.humblebundle.com/store/api/search?sort=discount&page=1&request=1", {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return deals;
    const data = await res.json() as { results: Array<{ human_name: string; current_price: { amount: number }; full_price: { amount: number }; discount_percentage: number; url: string }> };
    if (!data.results) return deals;

    for (const item of data.results.slice(0, 10)) {
      if (item.discount_percentage >= 50) {
        deals.push({
          title: item.human_name,
          originalPrice: item.full_price ? item.full_price.amount.toFixed(2) + "€" : "N/A",
          discountedPrice: item.current_price ? item.current_price.amount.toFixed(2) + "€" : "GRATUIT",
          discountPercent: item.discount_percentage,
          url: `https://www.humblebundle.com/store/${item.url}`,
          store: "Humble Bundle",
        });
      }
    }
  } catch (err) {
    logger.debug(`[MultiSiteDeals] Humble fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return deals;
}

async function fetchAllDeals(): Promise<Deal[]> {
  const allDeals = await Promise.allSettled([
    fetchSteamDeals(),
    fetchGOGDeals(),
    fetchHumbleDeals(),
  ]);

  const deals: Deal[] = [];
  for (const result of allDeals) {
    if (result.status === "fulfilled") {
      deals.push(...result.value);
    }
  }
  return deals;
}

async function checkDeals(client: Client): Promise<void> {
  try {
    const channelId = process.env.FREE_GAMES_CHANNEL_ID || process.env.STEAM_EPIC_CHANNEL_ID || "";
    if (!channelId) {
      logger.warn("[MultiSiteDeals] Pas de canal configuré");
      return;
    }

    const channel = client.channels.cache.get(channelId) as TextChannel;
    if (!channel?.isTextBased()) return;

    const deals = await fetchAllDeals();
    if (deals.length === 0) {
      logger.debug("[MultiSiteDeals] Aucun deal trouvé");
      return;
    }

  let postedCount = 0;
  for (const deal of deals) {
    const dedupKey = `deal:${deal.store}:${deal.title}`;
    if (dedupCache.isAlreadyProcessed("game_updates", dedupKey)) continue;

    // Auto-traduction FR
    let displayTitle = deal.title;
    try {
      const titleResult = await translateAutoToFrench(deal.title);
      if (titleResult && titleResult.detectedLanguage !== "fr") {
        displayTitle = titleResult.translatedText;
      }
    } catch {
      // Traduction échouée
    }

    const storeConfig = STORE_CONFIGS.find(s => s.name === deal.store);
    const emoji = storeConfig?.emoji || "🏷️";
    const color = storeConfig?.color || 0x5865f2;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${emoji} BON PLAN ${deal.store}` })
      .setTitle(`🔥 ${displayTitle}`)
      .setColor(color)
      .setURL(deal.url)
      .addFields(
        { name: "💰 Prix original", value: `~~${deal.originalPrice}~~`, inline: true },
        { name: "✅ Prix promo", value: `**${deal.discountedPrice}**`, inline: true },
        { name: "📉 Réduction", value: `**-${deal.discountPercent}%**`, inline: true },
      )
      .setFooter({ text: `Multi-Site Deals • ${deal.store}` })
      .setTimestamp();

    if (deal.image) {
      embed.setThumbnail(deal.image);
    }

    try {
      await channel.send({ embeds: [embed] });
      await dedupCache.markAsProcessed("game_updates", dedupKey);
      postedCount++;
      logger.info(`[MultiSiteDeals] Deal posté: ${deal.title} (${deal.store} -${deal.discountPercent}%)`);
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err) {
      logger.error(`[MultiSiteDeals] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (postedCount > 0) {
    logger.info(`[MultiSiteDeals] ${postedCount} deal(s) posté(s)`);
  }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("Received one or more errors")) {
      logger.debug("[MultiSiteDeals] Timeout API (normal si les stores sont lents)");
    } else {
      logger.error(`[MultiSiteDeals] erreur dans le tick : ${errMsg}`);
    }
  }
}

export function startMultiSiteDealsMonitor(client: Client): void {
  if (dealsInterval) return;
  logger.info(`[MultiSiteDeals] Monitoring Steam, GOG, Humble Bundle (intervalle: ${CHECK_INTERVAL_MS / 60000}min)`);

  setTimeout(() => checkDeals(client), 60000);
  dealsInterval = safeInterval("MultiSiteDeals", () => checkDeals(client), CHECK_INTERVAL_MS);
}

export function stopMultiSiteDealsMonitor(): void {
  if (dealsInterval) {
    clearInterval(dealsInterval);
    dealsInterval = null;
    logger.info("[MultiSiteDeals] Arrêté");
  }
}
