import logger from "../utils/logger";
import { config } from "../config";

import {
  exchangeNpssoForCode,
  exchangeAccessCodeForAuthTokens,
  getProfileFromUserName,
  getUserTitles,
  getUserTrophyProfileSummary,
} from "psn-api";

export interface PsnProfile {
  onlineId: string;
  accountId: string;
  avatarUrl: string;
  aboutMe: string;
  plusTier: number;
  trophySummary: PsnTrophySummary;
}

export interface PsnTrophySummary {
  level: number;
  progress: number;
  platinum: number;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface PsnGameTitle {
  npCommunicationId: string;
  titleName: string;
  platform: string;
  imageUrl: string;
  trophyCount: { platinum: number; gold: number; silver: number; bronze: number };
  progress: number;
  lastPlayedAt?: string;
}

export interface PsnDeal {
  title: string;
  originalPrice: string;
  discountedPrice: string;
  discountPercent: number;
  endDate: string;
  url: string;
  imageUrl: string;
}

let cachedAuth: { accessToken: string; expiresAt: number } | null = null;
let authPromise: Promise<string> | null = null;

export async function authenticatePsn(): Promise<string> {
  const now = Date.now();
  if (cachedAuth && now < cachedAuth.expiresAt - 60_000) {
    return cachedAuth.accessToken;
  }
  if (authPromise) return authPromise;

  const npsso = config.psnNpssoToken;
  if (!npsso) throw new Error("PSN_NPSSO_TOKEN manquant dans .env");

  authPromise = (async () => {
    try {
      const accessCode = await exchangeNpssoForCode(npsso);
      const authorization = await exchangeAccessCodeForAuthTokens(accessCode);
      cachedAuth = {
        accessToken: authorization.accessToken,
        expiresAt: now + (authorization.expiresIn ?? 3600) * 1000,
      };
      logger.info("[PSN] Authentification reussie");
      return authorization.accessToken;
    } catch (error) {
      logger.error("[PSN] Erreur d authentification:", String(error));
      throw new Error("Echec authentification PSN. Verifie ton token NPSSO.", { cause: error });
    } finally {
      authPromise = null;
    }
  })();

  return authPromise;
}

interface RawPsnData {
  accountId: string;
  onlineId: string;
  avatarUrls?: { avatarUrl: string }[];
  aboutMe?: string;
  plus?: number;
}

export async function getPsnProfile(username: string): Promise<PsnProfile | null> {
  try {
    const accessToken = await authenticatePsn();
    const result = await getProfileFromUserName({ accessToken }, username);
    const p = result.profile as unknown as RawPsnData;
    const accountId = p.accountId;

    let trophySummary: PsnTrophySummary = {
      level: 0, progress: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, total: 0,
    };

    if (accountId) {
      try {
        const td = await getUserTrophyProfileSummary({ accessToken }, accountId);
        trophySummary = {
          level: Number(td.trophyLevel) || 0,
          progress: Number(td.progress) || 0,
          platinum: td.earnedTrophies?.platinum || 0,
          gold: td.earnedTrophies?.gold || 0,
          silver: td.earnedTrophies?.silver || 0,
          bronze: td.earnedTrophies?.bronze || 0,
          total: Object.values(td.earnedTrophies || {}).reduce(
            (a: number, b: number) => a + b, 0
          ),
        };
      } catch (trophyErr) {
        logger.warn(`[PSN] Trophees indisponibles pour "${username}":`, String(trophyErr));
      }
    }

    return {
      onlineId: p.onlineId,
      accountId,
      avatarUrl: p.avatarUrls?.[0]?.avatarUrl || "",
      aboutMe: p.aboutMe || "",
      plusTier: p.plus || 0,
      trophySummary,
    };
  } catch (error) {
    logger.error(`[PSN] Erreur profil "${username}":`, String(error));
    return null;
  }
}

export async function getPsnRecentGames(
  accountIdOrUsername: string,
  limit = 10
): Promise<PsnGameTitle[]> {
  try {
    const accessToken = await authenticatePsn();

    // Si c'est un username, on résout d'abord en accountId
    let accountId = accountIdOrUsername;
    if (!/^\d+$/.test(accountIdOrUsername)) {
      const profile = await getPsnProfile(accountIdOrUsername);
      if (!profile) return [];
      accountId = profile.accountId;
      if (!accountId) return [];
    }

    const response = await getUserTitles({ accessToken }, accountId, { limit });

    return (response.trophyTitles || []).map((t) => ({
      npCommunicationId: t.npCommunicationId,
      titleName: t.trophyTitleName || (t as any).titleName || "Inconnu",
      platform: t.trophyTitlePlatform || "PS4/PS5",
      imageUrl: t.trophyTitleIconUrl || "",
      trophyCount: {
        platinum: t.earnedTrophies?.platinum || 0,
        gold: t.earnedTrophies?.gold || 0,
        silver: t.earnedTrophies?.silver || 0,
        bronze: t.earnedTrophies?.bronze || 0,
      },
      progress: t.progress || 0,
      lastPlayedAt: (t as any).lastUpdatedDateTime || undefined,
    }));
  } catch (error) {
    logger.error(`[PSN] Erreur jeux "${accountIdOrUsername}":`, String(error));
    return [];
  }
}

/**
 * Scrape les deals PlayStation depuis psprices.com.
 * Approche similaire a instantgaming.ts.
 */
export async function getPsnDeals(limit = 5): Promise<PsnDeal[]> {
  try {
    const url = "https://psprices.com/region-fr/discounts/?platform=PS4&sort=date";
    const response = await fetch(url, {
      headers: {
        "User-Agent": "DiscordSurveillanceBot/1.0",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];
    const html = await response.text();

    // Extraction basique des deals via regex sur les data attributes
    const deals: PsnDeal[] = [];
    const gameRegex = /<div[^>]*class="[^"]*game-row[^"]*"[^>]*data-name="([^"]*)"[^>]*data-price="([^"]*)"[^>]*data-cut="([^"]*)"[^>]*data-end="([^"]*)"[^>]*>/g;
    let match;

    while ((match = gameRegex.exec(html)) !== null && deals.length < limit) {
      const [, title, discountedPrice, discountPercent, endDate] = match;
      const originalPrice = String(Math.round(Number(discountedPrice) / (1 - Number(discountPercent) / 100) * 100) / 100);
      
      deals.push({
        title: title.replace(/&amp;/g, "&").replace(/&quot;/g, "\""),
        originalPrice: `${originalPrice}€`,
        discountedPrice: `${discountedPrice}€`,
        discountPercent: Number(discountPercent),
        endDate: endDate || "Inconnue",
        url: `https://psprices.com/region-fr/search/?q=${encodeURIComponent(title)}`,
        imageUrl: "",
      });
    }

    return deals;
  } catch (error) {
    logger.error("[PSN] Erreur deals:", String(error));
    return [];
  }
}

export function isValidPsnId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{3,16}$/.test(id);
}
