/**
 * externalApis.ts — Services pour les APIs externes
 *
 * Privilégie les endpoints sans clé API (RSS, scraping, endpoints publics).
 * Les services avec clé (Spotify, Last.fm, HuggingFace) restent optionnels.
 *
 * Services gérés :
 * 1.  GIPHY → Tenor endpoint public sans clé
 * 2.  YouTube → RSS feeds (youtube channel RSS)
 * 3.  Spotify Web API (recherche, clé requise)
 * 4.  RAWG → Steam Store scraping (sans clé)
 * 5.  NewsAPI → RSS feeds gaming (Reddit, Instant Gaming)
 * 6.  CheapShark (deals Steam, pas de clé)
 * 7.  ScreenshotOne → Playwright (sans clé)
 * 8.  Hugging Face (NLP, classification, optionnel)
 * 9.  Last.fm (scrobbling, clé requise)
 * 10. Anti-phishing (Sinking Yachts, sans clé)
 */

import { config } from "../config.js";
import logger from "../utils/logger.js";
import Parser from "rss-parser";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GifResult {
  url: string;
  preview: string;
  title: string;
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
}

export interface RawgGame {
  id: number;
  name: string;
  released: string | null;
  rating: number;
  platforms: string[];
  backgroundImage: string | null;
  description: string | null;
  genres: string[];
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl: string | null;
  description: string | null;
}

export interface CheapSharkDeal {
  title: string;
  store: string;
  salePrice: number;
  normalPrice: number;
  discount: number;
  steamRating: string | null;
  url: string;
}

export interface LastfmTrack {
  name: string;
  artist: string;
  url: string;
  playCount: number;
}

export interface PhishingResult {
  isPhishing: boolean;
  status: string;
  reportedAt: string | null;
  sources: string[];
}

// ─── 1. Tenor GIFs (endpoint public sans clé) ───────────────────────────────

export async function searchGifs(query: string, limit = 8): Promise<GifResult[]> {
  try {
    const url = `https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&limit=${limit}&contentfilter=medium`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Tenor API ${res.status}`);
    const data = (await res.json()) as {
      results: Array<{
        id: string;
        itemurl: string;
        media: Array<{ gif: { url: string; preview: string } }>;
        title: string;
      }>;
    };

    return (data.results ?? []).map((g) => ({
      url: g.media?.[0]?.gif?.url ?? g.itemurl,
      preview: g.media?.[0]?.gif?.preview ?? g.itemurl,
      title: g.title ?? query,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Tenor error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 2. YouTube RSS feeds (sans clé API) ─────────────────────────────────────

const rssParser = new Parser();

export async function searchYouTube(query: string, maxResults = 5): Promise<YouTubeVideo[]> {
  try {
    // YouTube RSS ne supporte pas la recherche textuelle directement.
    // On utilise l'endpoint public de recherche RSS via Invidious (instance publique).
    const invidiousInstances = [
      "https://invidious.snopyta.org",
      "https://yewtu.be",
      "https://inv.nadeko.net",
    ];

    for (const instance of invidiousInstances) {
      try {
        const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&limit=${maxResults}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const data = (await res.json()) as Array<{
          videoId: string;
          title: string;
          author: string;
          videoThumbnails: Array<{ url: string; quality: string }>;
        }>;

        return (data ?? []).slice(0, maxResults).map((v) => ({
          videoId: v.videoId,
          title: v.title,
          channel: v.author,
          thumbnail: v.videoThumbnails?.[0]?.url ?? "",
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
        }));
      } catch {
        continue;
      }
    }

    // Fallback: YouTube RSS feed pour les chaînes populaires gaming
    const gamingChannelIds = [
      "UCBR8-60-B28hp2BmDPdntcQ", // YouTube Gaming
      "UCuP2Kv8R3FJ7y4J4J4J4J4", // Gaming générique
    ];
    for (const channelId of gamingChannelIds) {
      try {
        const feed = await rssParser.parseURL(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
        );
        return feed.items.slice(0, maxResults).map((item) => {
          const videoId = item.link?.split("v=")[1] ?? "";
          return {
            videoId,
            title: item.title ?? "",
            channel: item.creator ?? "YouTube",
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            url: item.link ?? `https://www.youtube.com/watch?v=${videoId}`,
          };
        });
      } catch {
        continue;
      }
    }

    return [];
  } catch (error) {
    logger.warn(
      `[ExternalAPI] YouTube RSS error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 4. Spotify Web API ──────────────────────────────────────────────────────

let spotifyToken: string | null = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken(): Promise<string | null> {
  if (!config.spotifyClientId || !config.spotifyClientSecret) return null;
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

  try {
    const creds = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString(
      "base64",
    );
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Spotify token ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    spotifyToken = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Spotify token error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function searchSpotify(
  query: string,
  limit = 5,
): Promise<
  Array<{ name: string; artist: string; url: string; preview: string | null; image: string | null }>
> {
  const token = await getSpotifyToken();
  if (!token) return [];

  try {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Spotify API ${res.status}`);
    const data = (await res.json()) as {
      tracks: {
        items: Array<{
          name: string;
          external_urls: { spotify: string };
          preview_url: string | null;
          artists: Array<{ name: string }>;
          album: { images: Array<{ url: string }> };
        }>;
      };
    };

    return (data.tracks?.items ?? []).map((track) => ({
      name: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      url: track.external_urls.spotify,
      preview: track.preview_url,
      image: track.album?.images?.[0]?.url ?? null,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Spotify search error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 4. RAWG → Steam Store scraping (sans clé) ───────────────────────────────

export async function searchGame(query: string): Promise<RawgGame[]> {
  try {
    // Utiliser l'API publique Steam Store pour chercher des jeux
    const url = `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(query)}&l=fr&cc=FR`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Steam Store search ${res.status}`);
    const data = (await res.json()) as {
      items: Array<{
        id: number;
        name: string;
        release_date: { date: string };
        type: string;
        platforms: string[];
        header_image: string;
        short_description: string;
        genres: string[];
      }>;
    };

    return (data.items ?? []).slice(0, 5).map((g) => ({
      id: g.id,
      name: g.name,
      released: g.release_date?.date ?? null,
      rating: 0,
      platforms: g.platforms ?? [],
      backgroundImage: g.header_image ?? null,
      description: g.short_description ?? null,
      genres: g.genres ?? [],
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Steam Store search error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 5. NewsAPI → RSS feeds gaming ───────────────────────────────────────────

const newsRssFeeds = [
  "https://www.reddit.com/r/gaming/.rss",
  "https://www.reddit.com/r/Games/.rss",
  "https://www.instant-gaming.com/fr/rss/news.xml",
];

const NEWSAPI_GAMING_QUERY = "gaming OR jeux vidéo OR game release OR patch notes";

export async function getGamingNews(maxArticles = 5): Promise<NewsArticle[]> {
  // 1. Essayer NewsAPI en priorité si la clé est configurée
  if (config.newsApiKey) {
    try {
      const params = new URLSearchParams({
        q: NEWSAPI_GAMING_QUERY,
        language: "fr",
        sortBy: "publishedAt",
        pageSize: String(maxArticles),
        apiKey: config.newsApiKey,
      });

      const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          articles?: Array<{
            title: string;
            url: string;
            source?: { name?: string };
            publishedAt: string;
            urlToImage?: string | null;
            description?: string | null;
          }>;
        };

        if (data.articles && data.articles.length > 0) {
          return data.articles.map((a) => ({
            title: a.title,
            url: a.url,
            source: a.source?.name ?? "NewsAPI",
            publishedAt: a.publishedAt,
            imageUrl: a.urlToImage ?? null,
            description: a.description ?? null,
          }));
        }
      }
    } catch (error) {
      logger.warn(
        `[ExternalAPI] NewsAPI error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 2. Fallback : flux RSS (Reddit, Instant Gaming)
  try {
    const allArticles: NewsArticle[] = [];

    for (const feedUrl of newsRssFeeds) {
      try {
        const feed = await rssParser.parseURL(feedUrl);
        for (const item of feed.items) {
          allArticles.push({
            title: item.title ?? "",
            url: item.link ?? "",
            source: feed.title ?? feedUrl,
            publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
            imageUrl: item.enclosure?.url ?? null,
            description: item.contentSnippet ?? item.content ?? null,
          });
        }
      } catch {
        continue;
      }
    }

    allArticles.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
    return allArticles.slice(0, maxArticles);
  } catch (error) {
    logger.warn(
      `[ExternalAPI] RSS gaming news error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 7. CheapShark (deals Steam — pas de clé requise) ────────────────────────

export async function getSteamDeals(maxDeals = 10): Promise<CheapSharkDeal[]> {
  try {
    const url = `https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Deal%20Rating&pageSize=${maxDeals}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`CheapShark API ${res.status}`);
    const data = (await res.json()) as Array<{
      title: string;
      salePrice: string;
      normalPrice: string;
      savings: string;
      steamRatingText: string | null;
      dealID: string;
    }>;

    return (data ?? []).map((d) => ({
      title: d.title,
      store: "Steam",
      salePrice: parseFloat(d.salePrice),
      normalPrice: parseFloat(d.normalPrice),
      discount: Math.round(parseFloat(d.savings)),
      steamRating: d.steamRatingText,
      url: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] CheapShark error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export async function getPriceHistory(
  appId: number,
): Promise<Array<{ price: number; date: string }>> {
  try {
    const url = `https://www.cheapshark.com/api/1.0/pricechart?appid=${appId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`CheapShark pricechart ${res.status}`);
    const data = (await res.json()) as { prices: Array<{ price: string; date: string }> };
    return (data.prices ?? []).map((p) => ({ price: parseFloat(p.price), date: p.date }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] CheapShark pricechart error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 7. Screenshot via ScreenshotOne API → Playwright fallback ──────────────

let playwrightBrowser: import("playwright").Browser | null = null;

async function getPlaywrightBrowser(): Promise<import("playwright").Browser | null> {
  if (playwrightBrowser) return playwrightBrowser;
  try {
    const { chromium } = await import("playwright");
    playwrightBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    return playwrightBrowser;
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Playwright launch error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function takeScreenshot(targetUrl: string): Promise<Buffer | null> {
  // 1. ScreenshotOne API si clé configurée
  if (config.screenshotApiKey) {
    try {
      const params = new URLSearchParams({
        url: targetUrl,
        access_key: config.screenshotApiKey,
        format: "png",
        viewport_width: "1280",
        viewport_height: "720",
        delay: "2",
      });

      const res = await fetch(`https://api.screenshotone.com/take?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
      logger.warn(`[ExternalAPI] ScreenshotOne HTTP ${res.status}`);
    } catch (error) {
      logger.warn(
        `[ExternalAPI] ScreenshotOne error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 2. Fallback : Playwright
  const browser = await getPlaywrightBrowser();
  if (!browser) return null;

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);
    const buffer = await page.screenshot({ type: "png" });
    await page.close();
    return Buffer.from(buffer);
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Screenshot error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 9. Hugging Face Inference ───────────────────────────────────────────────

export async function hfClassifyText(
  text: string,
  model = "tabularisai/multilingual-sentiment-analysis",
): Promise<string | null> {
  if (!config.hfApiKey) return null;

  try {
    const url = `https://api-inference.huggingface.co/models/${model}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.hfApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HF API ${res.status}`);
    const data = (await res.json()) as Array<{ label: string; score: number }>;
    return data[0]?.label ?? null;
  } catch (error) {
    logger.warn(
      `[ExternalAPI] HuggingFace error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 10. Last.fm API ─────────────────────────────────────────────────────────

export async function getLastfmTopTracks(username: string, limit = 5): Promise<LastfmTrack[]> {
  if (!config.lastfmApiKey) return [];

  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${encodeURIComponent(username)}&api_key=${config.lastfmApiKey}&format=json&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Last.fm API ${res.status}`);
    const data = (await res.json()) as {
      toptracks: {
        track: Array<{ name: string; artist: { name: string }; url: string; playcount: string }>;
      };
    };

    return (data.toptracks?.track ?? []).map((t) => ({
      name: t.name,
      artist: t.artist.name,
      url: t.url,
      playCount: parseInt(t.playcount, 10) || 0,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Last.fm error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 10. Anti-phishing (Sinking Yachts, sans clé) ───────────────────────────

/**
 * Sinking Yachts — base communautaire de phishing Discord (sans clé).
 * Retourne true si le domaine est un phishing connu.
 */
async function checkSinkingYachts(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://phish.sinking.yachts/v2/check/${encodeURIComponent(domain)}`, {
      headers: { "X-Identity": "discord-bot-helldiver", Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Sinking Yachts API ${res.status}`);
    return ((await res.json()) as boolean) === true;
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Sinking Yachts error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Vérifie une URL contre le service anti-phishing Sinking Yachts (sans clé API).
 */
export async function checkPhishing(url: string): Promise<PhishingResult> {
  let domain: string;
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    domain = new URL(fullUrl).hostname;
  } catch {
    domain = url;
  }

  const isPhishing = await checkSinkingYachts(domain);

  return {
    isPhishing,
    status: isPhishing ? "phishing" : "clean",
    reportedAt: null,
    sources: isPhishing ? ["sinking-yachts"] : [],
  };
}

// ─── 11. Reddit RSS (sans clé API) ───────────────────────────────────────────

export async function getRedditPosts(
  subreddit: string,
  limit = 10,
): Promise<
  Array<{ title: string; url: string; score: number; author: string; createdUtc: number }>
> {
  try {
    const feed = await rssParser.parseURL(
      `https://www.reddit.com/r/${subreddit}/.rss?limit=${limit}`,
    );
    return feed.items.slice(0, limit).map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      score: 0,
      author: item.creator ?? "unknown",
      createdUtc: item.isoDate ? new Date(item.isoDate).getTime() / 1000 : 0,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Reddit RSS error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getApiStatus(): Record<string, boolean> {
  return {
    tenor: true,
    youtube: !!config.youtubeApiKey,
    spotify: !!config.spotifyClientId && !!config.spotifyClientSecret,
    steamStore: !!config.steamApiKey,
    steamApi: !!config.steamApiKey,
    rssNews: true,
    cheapshark: true,
    screenshot: !!config.screenshotApiKey,
    screenshotone: !!config.screenshotApiKey,
    huggingface: !!config.hfApiKey,
    lastfm: !!config.lastfmApiKey,
    sinkingYachts: true,
    redditRss: true,
    newsapi: !!config.newsApiKey,
    rawg: !!config.rawgApiKey,
    giphy: !!config.giphyApiKey,
    braveSearch: !!config.braveSearchApiKey,
    groq: !!config.groqApiKey,
    gemini: !!config.geminiApiKey,
    cohere: !!config.cohereApiKey,
    assemblyai: !!config.assemblyAiApiKey,
    openrouter: !!config.openRouterApiKey,
    googleCloud: !!config.googleCloudApiKey,
    igdb: !!config.igdbClientId && !!config.igdbClientSecret,
    steamgriddb: !!config.steamgriddbApiKey,
    uptimeRobot: !!config.uptimeRobotApiKey,
    wikipedia: true,
  };
}

// ─── 12. Wikipedia API (sans clé) ────────────────────────────────────────────

export interface WikipediaResult {
  title: string;
  extract: string;
  url: string;
  thumbnail: string | null;
}

export async function searchWikipedia(
  query: string,
  language = "fr",
): Promise<WikipediaResult | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "extracts|pageimages",
      exintro: "1",
      explaintext: "1",
      piprop: "thumbnail",
      pithumbsize: "400",
      redirects: "1",
      titles: query,
    });

    const res = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title: string;
            extract?: string;
            thumbnail?: { source: string };
            missing?: boolean;
          }
        >;
      };
    };

    const pages = data.query?.pages;
    if (!pages) return null;

    const page = Object.values(pages)[0];
    if (!page || page.missing || !page.extract) return null;

    return {
      title: page.title,
      extract: page.extract.slice(0, 1500),
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      thumbnail: page.thumbnail?.source ?? null,
    };
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Wikipedia error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}
