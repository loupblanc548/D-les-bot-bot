import { EpicGamesApiResponse, EpicGamesElement, EpicGamesPromotion, EpicGamesOffer, EpicGamesImage } from "../types/api.js";
import logger from "../utils/logger.js";
// API Epic Games - Jeux gratuits et promos
// Dedup via Prisma (pas de Set memoire)

import prisma from "../prisma.js";
import { Platform } from "@prisma/client";
import { config } from "../config.js";
import { Client } from "discord.js";

const EPIC_FREE_GAMES_URL =
  `${config.epicGamesApiUrl}/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR`;

export interface EpicGame {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  originalPrice: string | null;
  freeEndDate: string | null;
}

// Word-level fuzzy matching : evite les faux positifs (ex: "Skin" ne matche plus "Skinny")
function matchesWishlist(wishlistName: string, shopName: string): boolean {
  const w = wishlistName.toLowerCase().trim();
  const s = shopName.toLowerCase().trim();

  const wWords = new Set(w.split(/\W+/).filter(x => x.length > 2));
  for (const sw of s.split(/\W+/)) {
    if (wWords.has(sw)) return true;
  }

  const escRe = /[.*+?^${}()|[\]\\]/g;
  const escaped = w.replace(escRe, (ch) => "\\" + ch);
  const boundaryStart = "(^|\\W)";
  const boundaryEnd = "($|\\W)";
  if (new RegExp(boundaryStart + escaped + boundaryEnd, "i").test(s)) return true;

  return false;
}

export async function fetchFreeGames(client: Client): Promise<EpicGame[]> {
  try {
    const response = await fetch(EPIC_FREE_GAMES_URL);
    if (!response.ok) {
      logger.warn(`[EpicGames] HTTP ${response.status}`);
      return [];
    }

    const json = await response.json() as EpicGamesApiResponse;
    const elements: EpicGamesElement[] =
      json?.data?.Catalog?.searchStore?.elements || [];

    const games: EpicGame[] = [];

    for (const el of elements) {
      const promotions = el.promotions?.promotionalOffers || [];
      const upcomingPromotions = el.promotions?.upcomingPromotionalOffers || [];
      const allPromos = [...promotions, ...upcomingPromotions];

      const hasFreePromo = allPromos.some((po: EpicGamesPromotion) =>
        po.promotionalOffers?.some((offer: EpicGamesOffer) => {
          return offer.discountSetting?.discountPercentage === 0;
        })
      );

      if (!hasFreePromo) continue;

      const title = el.title || "Sans titre";
      const description = (el.description || "").slice(0, 500);
      const slug = el.productSlug || el.catalogNs?.mappings?.[0]?.pageSlug || "";
      const url = slug
        ? `https://store.epicgames.com/fr/p/${slug}`
        : "https://store.epicgames.com/fr/free-games";

      const keyImages: EpicGamesImage[] = el.keyImages || [];
      const offerImage =
        keyImages.find((i: EpicGamesImage) => i.type === "OfferImageWide") ||
        keyImages.find((i: EpicGamesImage) => i.type === "DieselStoreFrontWide") ||
        keyImages[0];
      const imageUrl = offerImage?.url || "";

      const priceInfo = el.price?.totalPrice?.fmtPrice;
      const originalPrice =
        priceInfo?.originalPrice && priceInfo.originalPrice !== "0"
          ? priceInfo.originalPrice
          : null;

      let freeEndDate: string | null = null;
      const firstPromo = allPromos[0]?.promotionalOffers?.[0];
      if (firstPromo?.endDate) freeEndDate = firstPromo.endDate;

      games.push({
        title,
        description,
        url,
        imageUrl,
        originalPrice,
        freeEndDate,
      });
    }

    // Dedup via Prisma : ne pas renotifier les jeux deja vus
    const newGames: EpicGame[] = [];
    for (const game of games) {
      const existing = await prisma.notification.findFirst({
        where: { url: game.url },
      });
      if (existing) continue;

      await prisma.notification.create({
        data: {
          sourceId: "epic-games",
          platform: "epicgames" as Platform,
          content: game.title,
          url: game.url,
        },
      });
      newGames.push(game);
    }

    if (newGames.length > 0) {
      logger.info(
        `[EpicGames] ${newGames.length} nouveau(x) jeu(x) gratuit(s)`
      );
    }

    // Scan wishlist et notification DM
    if (newGames.length > 0) {
      const wishlistItems = await prisma.wishlist.findMany();
      const matchMap = new Map<string, { userId: string; itemName: string; gameTitle: string; gameUrl: string; guildIds: Set<string> }>();
      for (const game of newGames) {
        for (const item of wishlistItems) {
          if (!item.itemName || !matchesWishlist(item.itemName, game.title)) continue;
          const key = item.userId + "|" + (item.itemName || "");
          if (!matchMap.has(key)) {
            matchMap.set(key, { userId: item.userId, itemName: item.itemName || "", gameTitle: game.title, gameUrl: game.url, guildIds: new Set() });
          }
          if (item.guildId) matchMap.get(key)!.guildIds.add(item.guildId);
        }
      }
      if (matchMap.size > 0) {
        logger.info("[EpicGames/Wishlist] " + matchMap.size + " correspondance(s) trouvee(s)");
        for (const [, match] of matchMap) {
          try {
            const user = await client.users.fetch(match.userId);
            if (user) {
              const guildNames: string[] = [];
              for (const gid of match.guildIds) {
                const guild = client.guilds.cache.get(gid);
                if (guild) guildNames.push(guild.name);
              }
              const guildSuffix = guildNames.length > 0 ? "\nServeur(s) : " + guildNames.join(", ") : "";
              await user.send("ð **Bonne nouvelle !**\n\nL'objet **" + match.itemName + "** que tu surveillais est disponible aujourd'hui dans la boutique Fortnite !" + guildSuffix + "\n" + match.gameUrl);
            }
          } catch (dmErr) {
            // Silencieux : DMs fermés ou utilisateur introuvable
          }
        }
      }
    }

    return newGames;
  } catch (err) {
    logger.error("[EpicGames] Erreur API:", String(err));
    return [];
  }
}
