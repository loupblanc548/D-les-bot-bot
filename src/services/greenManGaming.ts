import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import multiLevelCache from "./multiLevelCache.js";

interface GMGDeal {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  price: number;
  originalPrice?: number;
  platform: string;
}

const CACHE_KEY = "gmg_deals";
const CACHE_TTL = 900;

export async function fetchGMGDeals(): Promise<GMGDeal[]> {
  try {
    const cached = await multiLevelCache.get<GMGDeal[]>(CACHE_KEY);
    if (cached) {
      return cached;
    }

    const response = await fetch("https://www.greenmangaming.com/api/v1/deals");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as any;
    const deals: GMGDeal[] = [];

    if (data.deals && Array.isArray(data.deals)) {
      for (const deal of data.deals) {
        if (deal.slug && deal.name && deal.price) {
          deals.push({
            id: deal.slug,
            title: deal.name,
            url: `https://www.greenmangaming.com/games/${deal.slug}`,
            imageUrl: deal.images?.[0] || "",
            price: parseFloat(deal.price),
            originalPrice: deal.retailPrice ? parseFloat(deal.retailPrice) : undefined,
            platform: "green_man_gaming",
          });
        }
      }
    }

    await multiLevelCache.set(CACHE_KEY, deals, { redisTTL: CACHE_TTL });
    logger.info(`[GMG] Fetched ${deals.length} deals`);
    return deals;
  } catch (error) {
    logger.error("[GMG] Error fetching deals:", error);
    return [];
  }
}

export async function savePriceHistory(deals: GMGDeal[]): Promise<void> {
  try {
    const now = new Date();
    const records = deals.map((deal) => ({
      gameId: deal.id,
      platform: "green_man_gaming" as const,
      title: deal.title,
      price: deal.price,
      currency: "EUR",
      url: deal.url,
      imageUrl: deal.imageUrl,
      recordedAt: now,
    }));

    await prisma.priceHistory.createMany({
      data: records,
      skipDuplicates: true,
    });

    logger.info(`[GMG] Saved ${records.length} price records`);
  } catch (error) {
    logger.error("[GMG] Error saving price history:", error);
  }
}
