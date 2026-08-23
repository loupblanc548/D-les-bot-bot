/**
 * userPreferences.ts — Mémoire long-terme des préférences utilisateur
 *
 * Stocke et récupère les préférences apprises au fil des conversations:
 * - Langue préférée
 * - Jeux favoris
 * - Style de réponse (bref, détaillé)
 * - Sujets d'intérêt
 * - Personnalité (familier, formel)
 *
 * Stockage: Redis (L2) + cache mémoire (L1). Pas de Prisma pour éviter les migrations.
 */

import logger from "../utils/logger.js";
import { ensureConnected } from "../utils/redisClient.js";

interface UserPreference {
  userId: string;
  language?: string;
  favoriteGames?: string[];
  responseStyle?: "brief" | "detailed" | "balanced";
  interests?: string[];
  familiarity: "new" | "regular" | "veteran";
  customNotes?: string;
  lastInteraction: number;
  interactionCount: number;
}

const REDIS_PREFIX = "user:pref:";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min L1 cache
const REDIS_TTL_S = 90 * 24 * 60 * 60; // 90 days in Redis

// L1 cache
const prefCache = new Map<string, { pref: UserPreference; ts: number }>();

export async function getUserPreferences(userId: string): Promise<UserPreference> {
  // L1 cache
  const cached = prefCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.pref;
  }

  const defaultPref: UserPreference = {
    userId,
    familiarity: "new",
    lastInteraction: Date.now(),
    interactionCount: 0,
  };

  // L2: Redis
  try {
    const redis = await ensureConnected();
    if (redis) {
      const raw = (await redis.get(`${REDIS_PREFIX}${userId}`)) as string | null;
      if (raw) {
        const pref = JSON.parse(raw) as UserPreference;
        prefCache.set(userId, { pref, ts: Date.now() });
        return pref;
      }
    }
  } catch { logger.error("[Silent catch]"); }

  prefCache.set(userId, { pref: defaultPref, ts: Date.now() });
  return defaultPref;
}

async function savePreferences(pref: UserPreference): Promise<void> {
  prefCache.set(pref.userId, { pref, ts: Date.now() });

  // L2: Redis (fire-and-forget)
  try {
    const redis = await ensureConnected();
    if (redis) {
      await redis.setEx(`${REDIS_PREFIX}${pref.userId}`, REDIS_TTL_S, JSON.stringify(pref));
    }
  } catch { logger.error("[Silent catch]"); }
}

export async function recordInteraction(userId: string): Promise<void> {
  try {
    const pref = await getUserPreferences(userId);
    pref.interactionCount += 1;
    pref.lastInteraction = Date.now();
    pref.familiarity = pref.interactionCount > 50 ? "veteran" : pref.interactionCount > 5 ? "regular" : "new";
    await savePreferences(pref);
  } catch (err) {
    logger.debug(`[UserPref] recordInteraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function setUserLanguage(userId: string, language: string): Promise<void> {
  try {
    const pref = await getUserPreferences(userId);
    pref.language = language;
    await savePreferences(pref);
  } catch { logger.error("[Silent catch]"); }
}

export async function addUserInterest(userId: string, interest: string): Promise<void> {
  try {
    const pref = await getUserPreferences(userId);
    const interests = pref.interests ?? [];
    const lower = interest.toLowerCase();
    if (!interests.includes(lower)) {
      interests.push(lower);
      pref.interests = interests;
      await savePreferences(pref);
    }
  } catch { logger.error("[Silent catch]"); }
}

export async function addUserGame(userId: string, game: string): Promise<void> {
  try {
    const pref = await getUserPreferences(userId);
    const games = pref.favoriteGames ?? [];
    const lower = game.toLowerCase();
    if (!games.includes(lower)) {
      games.push(lower);
      pref.favoriteGames = games;
      await savePreferences(pref);
    }
  } catch { logger.error("[Silent catch]"); }
}

export async function setResponseStyle(userId: string, style: "brief" | "detailed" | "balanced"): Promise<void> {
  try {
    const pref = await getUserPreferences(userId);
    pref.responseStyle = style;
    await savePreferences(pref);
  } catch { logger.error("[Silent catch]"); }
}

export function formatPreferencesForPrompt(pref: UserPreference): string {
  const parts: string[] = [];

  if (pref.familiarity === "veteran") {
    parts.push("Cet utilisateur est un habitué — sois très familier, tu le connais bien.");
  } else if (pref.familiarity === "regular") {
    parts.push("Cet utilisateur revient souvent — sois familier mais pas trop.");
  } else {
    parts.push("Cet utilisateur est nouveau ou rare — sois accueillant mais pas envahissant.");
  }

  if (pref.language && pref.language !== "fr") {
    parts.push(`Langue préférée: ${pref.language}.`);
  }

  if (pref.favoriteGames && pref.favoriteGames.length > 0) {
    parts.push(`Jeux favoris: ${pref.favoriteGames.join(", ")}.`);
  }

  if (pref.interests && pref.interests.length > 0) {
    parts.push(`Centres d'intérêt: ${pref.interests.join(", ")}.`);
  }

  if (pref.responseStyle === "brief") {
    parts.push("Cet utilisateur préfère des réponses courtes et directes.");
  } else if (pref.responseStyle === "detailed") {
    parts.push("Cet utilisateur apprécie les réponses détaillées.");
  }

  if (pref.customNotes) {
    parts.push(`Notes: ${pref.customNotes}`);
  }

  return parts.length > 0 ? `\n## PROFIL UTILISATEUR\n${parts.join("\n")}\n` : "";
}

// Nettoyage périodique du cache L1
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of prefCache) {
    if (now - val.ts > CACHE_TTL_MS) {
      prefCache.delete(key);
    }
  }
}, 60 * 1000).unref();
