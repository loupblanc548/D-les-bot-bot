import { ITADSearchResponse, ITADPricesResponse, ITADLowestResponse } from "../types/api.js";
import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";

const ITAD_BASE = config.itadApiBaseUrl;

function apiKey(): string {
  return config.itadApiKey || "";
}

function buildUrl(path: string, params: Record<string, string>): string {
  const key = apiKey();
  const allParams = key ? { ...params, key } : params;
  const qs = Object.entries(allParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${ITAD_BASE}${path}?${qs}`;
}

export interface ITADGame {
  plain: string;
  title: string;
  type: string;
}

export interface ITADPrice {
  shop: { id: string; name: string };
  price_new: number;
  price_old: number;
  price_cut: number;
  url: string;
  drm: string[];
}

export interface ITADLowest {
  price: number;
  shop: { id: string; name: string };
  cut: number;
  recorded: number;
}

export interface ITADDealResult {
  game: ITADGame;
  prices: ITADPrice[];
  lowest: ITADLowest | null;
  url: string;
}

const STORE_DISPLAY: Record<string, string> = {
  steam: "💻 Steam",
  gog: "🎮 GOG",
  epic: "🏪 Epic Games",
  humble: "📦 Humble Bundle",
  greenmangaming: "🟢 Green Man Gaming",
  gamersgate: "🛒 GamersGate",
  fanatical: "🎯 Fanatical",
  gamesplanet: "🪐 Gamesplanet",
  origin: "🔶 Origin",
  uplay: "🔷 Ubisoft Store",
  microsoft: "🪟 Microsoft Store",
  itch: "🧶 itch.io",
  indiegala: "🎪 IndieGala",
  nuuvem: "🇧🇷 Nuuvem",
  amazon: "📦 Amazon",
};

function getStoreDisplay(shopId: string): string {
  return STORE_DISPLAY[shopId] || `🛒 ${shopId}`;
}

function formatPrice(price: number): string {
  return price.toFixed(2) + " €";
}

async function searchGame(query: string): Promise<ITADGame[]> {
  const url = buildUrl("/search/search/", { q: query, limit: "5" });
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
    });
    if (!res.ok) return [];
    const data = await res.json() as ITADSearchResponse;
    return data?.data?.list || [];
  } catch (err) {
    logger.error("[ITAD] Search error:", err);
    return [];
  }
}

async function getPrices(plains: string[]): Promise<ITADPrice[]> {
  const url = buildUrl("/game/prices/", {
    plains: plains.join(","),
    region: "FR",
    country: "FR",
  });
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
    });
    if (!res.ok) return [];
    const data = await res.json() as ITADPricesResponse;
    return data?.data?.[plains[0]]?.list || [];
  } catch (err) {
    logger.error("[ITAD] Prices error:", err);
    return [];
  }
}

async function getLowest(plains: string[]): Promise<ITADLowest | null> {
  const url = buildUrl("/game/lowest/", {
    plains: plains.join(","),
    region: "FR",
    country: "FR",
  });
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json() as ITADLowestResponse;
    return data?.data?.[plains[0]] || null;
  } catch (err) {
    logger.error("[ITAD] Lowest error:", err);
    return null;
  }
}

export async function getDeals(gameName: string): Promise<ITADDealResult | null> {
  const games = await searchGame(gameName);
  if (games.length === 0) return null;

  const bestMatch = games[0];
  const plain = bestMatch.plain;

  const [prices, lowest] = await Promise.all([
    getPrices([plain]),
    getLowest([plain]),
  ]);

  return {
    game: bestMatch,
    prices,
    lowest,
    url: `https://isthereanydeal.com/game/${plain}/info/`,
  };
}

export function buildDealEmbed(result: ITADDealResult): EmbedBuilder {
  const { game, prices, lowest, url } = result;

  const embed = new EmbedBuilder()
    .setAuthor({ name: "Comparateur de prix • IsThereAnyDeal" })
    .setTitle("🏷️ " + game.title)
    .setURL(url)
    .setColor(0x5865f2)
    .setTimestamp();

  if (prices.length > 0) {
    const sorted = [...prices].sort((a, b) => a.price_new - b.price_new);
    const top5 = sorted.slice(0, 5);
    let priceText = "";
    for (const p of top5) {
      const store = getStoreDisplay(p.shop.id);
      if (p.price_cut > 0) {
        priceText += `~~${formatPrice(p.price_old)}~~ **${formatPrice(p.price_new)}** (-${p.price_cut}%)\n↳ ${store}\n`;
      } else {
        priceText += `**${formatPrice(p.price_new)}**\n↳ ${store}\n`;
      }
    }
    embed.addFields({ name: "💰 Meilleurs prix", value: priceText || "Aucun prix trouvé", inline: false });
  } else {
    embed.addFields({ name: "💰 Meilleurs prix", value: "Aucun prix disponible actuellement.", inline: false });
  }

  if (lowest) {
    const lowestDate = new Date(lowest.recorded * 1000).toLocaleDateString("fr-FR");
    embed.addFields({
      name: "📉 Plus bas historique",
      value: `**${formatPrice(lowest.price)}** sur ${getStoreDisplay(lowest.shop.id)}\n↳ Le ${lowestDate} (-${lowest.cut}%)`,
      inline: false,
    });
  }

  embed.addFields({
    name: "🔗 Voir tous les deals",
    value: `[IsThereAnyDeal → ${game.title}](${url})`,
    inline: false,
  });

  return embed;
}
