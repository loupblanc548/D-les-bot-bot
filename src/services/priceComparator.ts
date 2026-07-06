import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";

interface StorePrice {
  store: string;
  price: number;
  currency: string;
  url: string;
  logo: string;
}

const STORE_LOGOS: Record<string, string> = {
  Steam: "https://store.steampowered.com/images/store_page/steam_logo.png",
  "Epic Games": "https://cdn2.unrealengine.com/epicgames-logo-940x530.png",
  "Instant Gaming": "https://www.instant-gaming.com/assets/images/ig-logo.png",
  CDKeys: "https://www.cdkeys.com/favicon.ico",
  "Green Man Gaming": "https://www.greenmangaming.com/favicon.ico",
  "Humble Bundle": "https://www.humblebundle.com/favicon.ico",
  Fanatical: "https://www.fanatical.com/favicon.ico",
};

export async function compareGamePrices(gameName: string): Promise<{ gameName: string; prices: StorePrice[]; cheapest: StorePrice | null }> {
  const prices: StorePrice[] = [];

  const fetchers = [
    fetchSteamPrice,
    fetchInstantGamingPrice,
    fetchEpicPrice,
  ];

  for (const fetcher of fetchers) {
    try {
      const result = await fetcher(gameName);
      if (result) prices.push(result);
    } catch (err) {
      logger.debug(`[PriceCompare] Erreur ${fetcher.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  prices.sort((a, b) => a.price - b.price);
  const cheapest = prices[0] ?? null;

  return { gameName, prices, cheapest };
}

async function fetchSteamPrice(gameName: string): Promise<StorePrice | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(gameName)}&l=fr&cc=fr`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const item = data.items?.[0];
    if (!item) return null;

    const price = (item.price?.final ?? 0) / 100;
    return {
      store: "Steam",
      price,
      currency: "EUR",
      url: `https://store.steampowered.com/app/${item.id}`,
      logo: STORE_LOGOS["Steam"] || "",
    };
  } catch {
    return null;
  }
}

async function fetchInstantGamingPrice(gameName: string): Promise<StorePrice | null> {
  try {
    const res = await fetch(
      `https://www.instant-gaming.com/fr/recherche/?q=${encodeURIComponent(gameName)}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const priceMatch = html.match(/class="price"[^>]*>([\d.,]+)\s*€/);
    const linkMatch = html.match(/href="(\/fr\/[^"]+)"/);
    if (!priceMatch || !linkMatch) return null;

    const price = parseFloat(priceMatch[1].replace(",", "."));
    return {
      store: "Instant Gaming",
      price,
      currency: "EUR",
      url: `https://www.instant-gaming.com${linkMatch[1]}`,
      logo: STORE_LOGOS["Instant Gaming"] || "",
    };
  } catch {
    return null;
  }
}

async function fetchEpicPrice(gameName: string): Promise<StorePrice | null> {
  try {
    const res = await fetch(
      `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const game = data.data?.Catalog?.searchStore?.elements?.find(
      (e: any) => e.title?.toLowerCase().includes(gameName.toLowerCase()),
    );
    if (!game) return null;

    const price = (game.price?.totalPrice?.originalPrice ?? 0) / 100;
    return {
      store: "Epic Games",
      price,
      currency: "EUR",
      url: `https://store.epicgames.com/fr/p/${game.urlSlug}`,
      logo: STORE_LOGOS["Epic Games"] || "",
    };
  } catch {
    return null;
  }
}

export async function sendPriceComparison(client: Client, gameName: string, channelId?: string): Promise<void> {
  const { prices, cheapest } = await compareGamePrices(gameName);

  if (prices.length === 0) {
    logger.warn(`[PriceCompare] Aucun prix trouvé pour "${gameName}"`);
    return;
  }

  const targetChannelId = channelId || config.dealsChannel || config.steamEpicChannel || "";
  const channel = client.channels.cache.get(targetChannelId) as TextChannel;
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(`💰 Comparateur de prix — ${gameName}`)
    .setColor(0x00ff00)
    .setFooter({ text: "Surveillance System • Price Comparator" })
    .setTimestamp();

  if (cheapest) {
    embed.setDescription(`**Meilleur prix : ${cheapest.price.toFixed(2)}€ sur ${cheapest.store}**\n[👉 Acheter](${cheapest.url})`);
  }

  for (const p of prices) {
    embed.addFields({
      name: p.store,
      value: `**${p.price.toFixed(2)}€**\n[Lien](${p.url})`,
      inline: true,
    });
  }

  try {
    await channel.send({ embeds: [embed] });
    logger.info(`[PriceCompare] Comparaison envoyée pour "${gameName}" — ${prices.length} boutique(s)`);
  } catch (err) {
    logger.error(`[PriceCompare] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
  }
}
