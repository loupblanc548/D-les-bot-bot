import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import multiLevelCache from "./multiLevelCache.js";

interface HumbleBundleDeal {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  price: number;
  originalPrice?: number;
  platform: string;
}

const CACHE_KEY = "humble_bundle_deals";
const CACHE_TTL = 900;

export async function fetchHumbleBundleDeals(): Promise<HumbleBundleDeal[]> {
  try {
    const cached = await multiLevelCache.get<HumbleBundleDeal[]>(CACHE_KEY);
    if (cached) {
      return cached;
    }

    const response = await fetch("https://www.humblebundle.com/api/v1/bundles");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as any[];
    const deals: HumbleBundleDeal[] = [];

    for (const bundle of data) {
      if (bundle.products && Array.isArray(bundle.products)) {
        for (const product of bundle.products) {
          if (product.human_name && product.url) {
            deals.push({
              id: product.machine_name || String(bundle.id),
              title: product.human_name,
              url: product.url,
              imageUrl: product.tile_image || "",
              price: product.display_price || 0,
              originalPrice: product.display_original_price || undefined,
              platform: "humble_bundle",
            });
          }
        }
      }
    }

    await multiLevelCache.set(CACHE_KEY, deals, { redisTTL: CACHE_TTL });
    logger.info(`[HumbleBundle] Fetched ${deals.length} deals`);
    return deals;
  } catch (error) {
    logger.error("[HumbleBundle] Error fetching deals:", error);
    return [];
  }
}

export async function savePriceHistory(deals: HumbleBundleDeal[]): Promise<void> {
  try {
    const now = new Date();
    const records = deals.map((deal) => ({
      gameId: deal.id,
      platform: "humble_bundle" as const,
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

    logger.info(`[HumbleBundle] Saved ${records.length} price records`);
  } catch (error) {
    logger.error("[HumbleBundle] Error saving price history:", error);
  }
}
