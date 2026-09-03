import fs from "node:fs";
import path from "node:path";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { getFortniteState } from "./fortnite-broadcast.js";
import { fetchShop } from "./fortnite-api.js";
import { getSelfLearnerStatus } from "./selfLearner.js";

const SHOP_STATE_FILE = path.join("/tmp", "bot-last-fortnite-shop.json");

export function readLastShopDate(): string | null {
  try {
    if (!fs.existsSync(SHOP_STATE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(SHOP_STATE_FILE, "utf-8")) as { date?: string };
    return raw.date || null;
  } catch {
    return null;
  }
}

export async function getJohnOverview(): Promise<{
  name: string;
  model: string;
  boutiqueChannel: string;
  shopLastPosted: string | null;
  wishlistCount: number;
  subjectsLearned: number;
  learnerActive: boolean;
  learnerBusy: boolean;
}> {
  const learner = getSelfLearnerStatus();
  const wishlistCount = await prisma.wishlist
    .count({ where: { platform: "fortnite" } })
    .catch(() => 0);
  return {
    name: "John",
    model: config.openRouterModel || "",
    boutiqueChannel: config.boutiqueChannel || "",
    shopLastPosted: readLastShopDate(),
    wishlistCount,
    subjectsLearned: learner.subjectsLearned,
    learnerActive: learner.active,
    learnerBusy: learner.isLearning,
  };
}

export async function getLearnPanel(): Promise<{
  subjectsLearned: number;
  subjectsRemaining: number;
  batchSize: number;
  intervalMs: number;
  active: boolean;
  isLearning: boolean;
  webScanActive: boolean;
}> {
  const learner = getSelfLearnerStatus();
  return {
    subjectsLearned: learner.subjectsLearned,
    subjectsRemaining: learner.subjectsRemaining,
    batchSize: learner.batchSize,
    intervalMs: learner.intervalMs,
    active: learner.active,
    isLearning: learner.isLearning,
    webScanActive: learner.webScanActive,
  };
}

export async function getFortnitePanel(): Promise<{
  tweets: number;
  news: number;
  skins: number;
  accounts: string[];
  shop: Array<{ name: string; rarity: string; price: number; icon?: string }>;
  shopDate: string;
  shopLastPosted: string | null;
  shopItemsTotal: number;
  cosmeticsTracked: number;
  wishlist: Array<{ userId: string; itemName: string; gameName: string | null }>;
  boutiqueChannel: string;
  detections: Array<{ type: string; time: string; message: string }>;
}> {
  const fnState = getFortniteState();
  const tweetCount = await prisma.processedTweets.count().catch(() => 0);
  const accountsRaw = process.env.TWITTER_ACCOUNTS_FORTNITE_ACCOUNTS || "";
  const accounts = accountsRaw
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  const [cosmeticsTracked, wishlistRows, recentPosts] = await Promise.all([
    prisma.wishlist.count({ where: { platform: "fortnite" } }).catch(() => 0),
    prisma.wishlist
      .findMany({
        where: { platform: "fortnite" },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { userId: true, itemName: true, gameName: true },
      })
      .catch(() => []),
    prisma.processedTweets
      .findMany({ orderBy: { id: "desc" }, take: 15 })
      .catch((): Array<{ tweetId?: string; processedAt?: Date }> => []),
  ]);

  let shop = (fnState.shop || []).map((item) => ({
    name: item.name,
    rarity: item.rarity,
    price: item.price,
    icon: item.icon,
  }));
  let shopDate = "";

  if (shop.length === 0) {
    try {
      const live = await fetchShop();
      if (live) {
        shopDate = live.date || "";
        const items = [
          ...live.featured,
          ...live.daily,
          ...live.specialFeatured,
          ...live.specialDaily,
        ];
        shop = items.slice(0, 16).map((entry) => ({
          name: entry.displayName,
          rarity: entry.rarity,
          price: entry.price,
          icon: entry.icon,
        }));
      }
    } catch {
      // API boutique optionnelle
    }
  }

  const detections = [
    ...(fnState.detections || []),
    ...recentPosts.map((p) => ({
      type: "tweets",
      time: p.processedAt?.toISOString?.() || new Date().toISOString(),
      message: `Tweet traité: ${p.tweetId || "?"}`,
    })),
  ].slice(0, 15);

  return {
    tweets: fnState.tweets || tweetCount,
    news: fnState.news || 0,
    skins: fnState.skins || shop.length,
    accounts,
    shop,
    shopDate,
    shopLastPosted: readLastShopDate(),
    shopItemsTotal: shop.length,
    cosmeticsTracked,
    wishlist: wishlistRows,
    boutiqueChannel: config.boutiqueChannel || "",
    detections,
  };
}
