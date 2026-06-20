import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import multiLevelCache from "./multiLevelCache.js";

interface XboxGamePassGame {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  platform: string;
  addedAt?: Date;
  removedAt?: Date;
}

const CACHE_KEY = "xbox_game_pass_games";
const CACHE_TTL = 1800;

export async function fetchXboxGamePassGames(): Promise<XboxGamePassGame[]> {
  try {
    const cached = await multiLevelCache.get<XboxGamePassGame[]>(CACHE_KEY);
    if (cached) {
      return cached;
    }

    const response = await fetch("https://catalog.gamepass.com/sigls/v2?id=2b8ac61a-e65e-4f01-b428-5bda35b4d0c1&language=en&market=US");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as any;
    const games: XboxGamePassGame[] = [];

    if (data && Array.isArray(data)) {
      for (const id of data) {
        const gameResponse = await fetch(`https://displaycatalog.mp.microsoft.com/v3.0/products?bigIds=${id}&market=US&languages=en-us&MS-CV=DGU`);
        if (gameResponse.ok) {
          const gameData = await gameResponse.json() as any;
          if (gameData.Products && gameData.Products[0]) {
            const product = gameData.Products[0];
            games.push({
              id: product.DisplaySkuAvailabilities?.[0]?.Sku?.ProductId || id,
              title: product.LocalizedProperties?.[0]?.ProductTitle || "Unknown",
              url: `https://www.xbox.com/games/store/${id}`,
              imageUrl: product.LocalizedProperties?.[0]?.Images?.[0]?.Url || "",
              platform: "xbox_game_pass",
            });
          }
        }
      }
    }

    await multiLevelCache.set(CACHE_KEY, games, { redisTTL: CACHE_TTL });
    logger.info(`[XboxGamePass] Fetched ${games.length} games`);
    return games;
  } catch (error) {
    logger.error("[XboxGamePass] Error fetching games:", error);
    return [];
  }
}

export async function savePriceHistory(games: XboxGamePassGame[]): Promise<void> {
  try {
    const now = new Date();
    const records = games.map((game) => ({
      gameId: game.id,
      platform: "xbox_game_pass" as const,
      title: game.title,
      price: 0,
      currency: "EUR",
      url: game.url,
      imageUrl: game.imageUrl,
      recordedAt: now,
    }));

    await prisma.priceHistory.createMany({
      data: records,
      skipDuplicates: true,
    });

    logger.info(`[XboxGamePass] Saved ${records.length} price records`);
  } catch (error) {
    logger.error("[XboxGamePass] Error saving price history:", error);
  }
}
