import axios from "axios";
import { config } from "../config";
import logger from "../utils/logger";
import { setCache, getCache } from "../utils/redis";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SteamAppEntry {
  appid: number;
  name: string;
}

interface SteamAppListResponse {
  applist: {
    apps: SteamAppEntry[];
  };
}

interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  is_external_url: boolean;
  author: string;
  contents: string;
  feedlabel: string;
  date: number;
  feedname: string;
  feed_type: number;
  appid: number;
  tags?: string[];
}

interface SteamNewsResponse {
  appnews: {
    appid: number;
    newsitems: SteamNewsItem[];
    count: number;
  };
}

export interface GameNews {
  title: string;
  url: string;
  content: string;
  date: Date;
  gid: string;
  appId: number;
  author: string;
  feedLabel: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STEAM_APP_LIST_KEY = "steam:applist";
const STEAM_APP_LIST_TTL = 86400; // 24 heures

// ─── BBCode Cleaner ───────────────────────────────────────────────────────────

function cleanBBCode(text: string): string {
  return text
    .replace(/\[[/?list]?list\]/gi, "")
    .replace(/\[[/?list]?olist\]/gi, "")
    .replace(/\[[/?list]?table(?:=[^\]]*)?\]/gi, "")
    .replace(/\[[/?list]?tr\]/gi, "")
    .replace(/\[[/?list]?td\]/gi, "")
    .replace(/\[[/?list]?th\]/gi, "")
    .replace(/\[[/?list]?h[1-6]\]/gi, "")
    .replace(/\[\*\]/g, "• ")
    .replace(/\[b\](.*?)\[[/?list]b\]/gi, "**$1**")
    .replace(/\[i\](.*?)\[[/?list]i\]/gi, "*$1*")
    .replace(/\[u\](.*?)\[[/?list]u\]/gi, "__$1__")
    .replace(/\[s\](.*?)\[[/?list]s\]/gi, "~~$1~~")
    .replace(/\[url=([^\]]*)\](.*?)\[[/?list]url\]/gi, "$2 ($1)")
    .replace(/\[url\](.*?)\[[/?list]url\]/gi, "$1")
    .replace(/\[img\](.*?)\[[/?list]img\]/gi, "[Image: $1]")
    .replace(/\[quote(?:=[^\]]*)?\](.*?)\[[/?list]quote\]/gis, "> $1")
    .replace(/\[code\](.*?)\[[/?list]code\]/gis, "```\n$1\n```")
    .replace(/\[spoiler\](.*?)\[[/?list]spoiler\]/gi, "||$1||")
    .replace(/\[[/?list]?\w+(?:=[^\]]*)?\]/gi, "") // Nettoyer les balises résiduelles
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Synchronisation de la liste des apps Steam ───────────────────────────────

export async function syncSteamApps(): Promise<SteamAppEntry[]> {
  const cached = await getCache<SteamAppEntry[]>(STEAM_APP_LIST_KEY);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    logger.info("[SteamNews] Téléchargement de la liste des apps Steam...");
    const response = await axios.get<SteamAppListResponse>(
      "https://api.steampowered.com/ISteamApps/GetAppList/v2/",
      { timeout: 30000 }
    );
    const apps = response.data?.applist?.apps ?? [];
    if (apps.length === 0) {
      logger.warn("[SteamNews] Liste des apps vide, conservation de l'ancien cache");
      return cached ?? [];
    }
    await setCache(STEAM_APP_LIST_KEY, apps, STEAM_APP_LIST_TTL);
    logger.info(`[SteamNews] ✓ ${apps.length.toLocaleString()} apps Steam indexées en cache`);
    return apps;
  } catch (error) {
    logger.error("[SteamNews] Erreur synchronisation apps:", String(error));
    return cached ?? [];
  }
}

// ─── Recherche d'AppID par nom ────────────────────────────────────────────────

export async function findAppIdByName(gameName: string): Promise<{
  appid: number;
  name: string;
  score: number;
} | null> {
  const apps = await syncSteamApps();
  if (apps.length === 0) return null;

  const query = gameName.toLowerCase().trim();

  // Stratégie de matching en plusieurs passes
  const scored = apps
    .map((app) => {
      const name = app.name.toLowerCase();
      let score = 0;

      // Match exact (priorité maximale)
      if (name === query) score = 1000;
      // Commence par la requête
      else if (name.startsWith(query)) score = 500;
      // Contient la requête comme mot complet
      else if (new RegExp(`\b${escapeRegex(query)}\b`).test(name)) score = 300;
      // Contient la requête partiellement
      else if (name.includes(query)) score = 100;
      // Match fuzzy : chaque mot de la requête présent dans le nom
      else {
        const queryWords = query.split(/[/?list]+/);
        const matchCount = queryWords.filter((w) => name.includes(w)).length;
        if (matchCount === queryWords.length) score = 50;
        else if (matchCount > 0) score = matchCount * 10;
      }

      return { appid: app.appid, name: app.name, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}

function escapeRegex(str: string): string {
  // Utilise le constructeur RegExp pour éviter les problèmes de parsing TypeScript avec ${} dans les regex
  const ESCAPE_REGEX = new RegExp('[.*+?^\${}()|[\]\]', 'g');
  return str.replace(ESCAPE_REGEX, '$&');
}

// ─── Récupération des dernières news ──────────────────────────────────────────

export async function getLatestNews(appId: number): Promise<GameNews | null> {
  try {
    const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=1&maxlength=1500&format=json`;
    const response = await axios.get<SteamNewsResponse>(url, {
      timeout: config.steamTimeoutMs,
    });

    const newsItems = response.data?.appnews?.newsitems ?? [];
    if (newsItems.length === 0) return null;

    const item = newsItems[0];
    return {
      title: item.title,
      url: item.url || `https://store.steampowered.com/news/app/${appId}`,
      content: cleanBBCode(item.contents),
      date: new Date(item.date * 1000),
      gid: item.gid,
      appId: item.appid,
      author: item.author,
      feedLabel: item.feedlabel,
    };
  } catch (error) {
    logger.warn(`[SteamNews] Erreur récupération news pour appId ${appId}:`, String(error));
    return null;
  }
}

// ─── Helper : Récupération multiple (pour le cron) ────────────────────────────

export async function getLatestNewsForApps(
  appIds: number[]
): Promise<Map<number, GameNews>> {
  const results = new Map<number, GameNews>();
  for (const appId of appIds) {
    const news = await getLatestNews(appId);
    if (news) results.set(appId, news);
  }
  return results;
}
