/**
 * externalApis.ts — Services pour les APIs externes
 *
 * Chaque service vérifie si la clé API est configurée.
 * Si absente → fallback gracieux (message d'erreur ou heuristique).
 * Si présente → appel API réel.
 *
 * APIs gérées :
 * 1.  Perspective API (toxicité IA)
 * 2.  Tenor (GIFs)
 * 3.  YouTube Data API v3 (recherche vidéos)
 * 4.  Spotify Web API (recherche, now-playing)
 * 5.  RAWG (base de données jeux)
 * 6.  NewsAPI (articles gaming)
 * 7.  CheapShark (deals Steam, pas de clé)
 * 8.  ScreenshotOne (capture d'écran URL)
 * 9.  Hugging Face (NLP, classification)
 * 10. Last.fm (scrobbling, recommandations)
 * 11. Phisherman (anti-phishing)
 * 12. Imgur (upload images)
 * 13. Reddit API officielle (posts, trending)
 */

import { config } from "../config.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToxicityResult {
  score: number;
  categories: { toxicity: number; insult: number; threat: number; spam: number };
}

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

export interface PhishermanResult {
  isPhishing: boolean;
  status: string;
  reportedAt: string | null;
}

// ─── 1. Perspective API (toxicité IA) ────────────────────────────────────────

export async function analyzeToxicity(text: string): Promise<ToxicityResult | null> {
  if (!config.perspectiveApiKey) return null;

  try {
    const url = `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${config.perspectiveApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: { text },
        languages: ["fr", "en"],
        requestedAttributes: { TOXICITY: {}, INSULT: {}, THREAT: {}, SPAM: {} },
      }),
    });

    if (!res.ok) throw new Error(`Perspective API ${res.status}`);
    const data = (await res.json()) as {
      attributeScores: Record<string, { summaryScore: { value: number } }>;
    };

    const get = (attr: string) =>
      Math.round((data.attributeScores[attr]?.summaryScore.value ?? 0) * 100);

    return {
      score: get("TOXICITY"),
      categories: {
        toxicity: get("TOXICITY"),
        insult: get("INSULT"),
        threat: get("THREAT"),
        spam: get("SPAM"),
      },
    };
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Perspective error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 2. Tenor GIF API ────────────────────────────────────────────────────────

export async function searchGifs(query: string, limit = 8): Promise<GifResult[]> {
  if (!config.tenorApiKey) return [];

  try {
    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${config.tenorApiKey}&limit=${limit}&media_filter=gif`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tenor API ${res.status}`);
    const data = (await res.json()) as {
      results: Array<{
        url: string;
        content_description: string;
        media_formats: { tinygif: { url: string } };
      }>;
    };

    return (data.results ?? []).map((r) => ({
      url: r.url,
      preview: r.media_formats?.tinygif?.url ?? r.url,
      title: r.content_description ?? query,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Tenor error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 3. YouTube Data API v3 ──────────────────────────────────────────────────

export async function searchYouTube(query: string, maxResults = 5): Promise<YouTubeVideo[]> {
  if (!config.youtubeApiKey) return [];

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&key=${config.youtubeApiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API ${res.status}`);
    const data = (await res.json()) as {
      items: Array<{
        id: { videoId: string };
        snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } } };
      }>;
    };

    return (data.items ?? []).map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url ?? "",
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] YouTube error: ${error instanceof Error ? error.message : String(error)}`,
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
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

// ─── 5. RAWG API (base de données jeux) ──────────────────────────────────────

export async function searchGame(query: string): Promise<RawgGame[]> {
  if (!config.rawgApiKey) return [];

  try {
    const url = `https://api.rawg.io/api/games?key=${config.rawgApiKey}&search=${encodeURIComponent(query)}&page_size=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RAWG API ${res.status}`);
    const data = (await res.json()) as {
      results: Array<{
        id: number;
        name: string;
        released: string | null;
        rating: number;
        platforms: Array<{ platform: { name: string } }>;
        background_image: string | null;
        description_raw?: string;
        genres: Array<{ name: string }>;
      }>;
    };

    return (data.results ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      released: g.released,
      rating: g.rating,
      platforms: (g.platforms ?? []).map((p) => p.platform.name),
      backgroundImage: g.background_image,
      description: g.description_raw ?? null,
      genres: (g.genres ?? []).map((gen) => gen.name),
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] RAWG error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 6. NewsAPI (articles gaming) ────────────────────────────────────────────

export async function getGamingNews(maxArticles = 5): Promise<NewsArticle[]> {
  if (!config.newsApiKey) return [];

  try {
    const url = `https://newsapi.org/v2/everything?q=gaming+OR+videogame+OR+playstation+OR+xbox+OR+nintendo&language=fr&sortBy=publishedAt&pageSize=${maxArticles}&apiKey=${config.newsApiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
    const data = (await res.json()) as {
      articles: Array<{
        title: string;
        url: string;
        source: { name: string };
        publishedAt: string;
        urlToImage: string | null;
        description: string | null;
      }>;
    };

    return (data.articles ?? []).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source?.name ?? "Unknown",
      publishedAt: a.publishedAt,
      imageUrl: a.urlToImage,
      description: a.description,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] NewsAPI error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 7. CheapShark (deals Steam — pas de clé requise) ────────────────────────

export async function getSteamDeals(maxDeals = 10): Promise<CheapSharkDeal[]> {
  try {
    const url = `https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Deal%20Rating&pageSize=${maxDeals}`;
    const res = await fetch(url);
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
    const res = await fetch(url);
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

// ─── 8. ScreenshotOne (capture d'écran URL) ──────────────────────────────────

export async function takeScreenshot(targetUrl: string): Promise<Buffer | null> {
  if (!config.screenshotApiKey) return null;

  try {
    const apiUrl = `https://api.screenshotone.com/take?access_key=${config.screenshotApiKey}&url=${encodeURIComponent(targetUrl)}&viewport_width=1280&viewport_height=720&format=png&delay=2`;
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`ScreenshotOne ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    logger.warn(
      `[ExternalAPI] ScreenshotOne error: ${error instanceof Error ? error.message : String(error)}`,
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
    const res = await fetch(url);
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

// ─── 11. Phisherman (anti-phishing) ──────────────────────────────────────────

export async function checkPhishing(url: string): Promise<PhishermanResult> {
  if (!config.phishermanApiKey) {
    return { isPhishing: false, status: "not_checked", reportedAt: null };
  }

  try {
    const res = await fetch("https://api.phisherman.gg/v2/phish/check", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.phishermanApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`Phisherman API ${res.status}`);
    const data = (await res.json()) as { status: string; reportedAt?: string };

    return {
      isPhishing: data.status === "phishing" || data.status === "suspicious",
      status: data.status,
      reportedAt: data.reportedAt ?? null,
    };
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Phisherman error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { isPhishing: false, status: "error", reportedAt: null };
  }
}

// ─── 12. Imgur (upload images) ───────────────────────────────────────────────

export async function uploadToImgur(imageBuffer: Buffer, name = "upload"): Promise<string | null> {
  if (!config.imgurClientId) return null;

  try {
    const formData = new FormData();
    formData.append("image", new Blob([new Uint8Array(imageBuffer)]));
    formData.append("type", "image");
    formData.append("name", name);

    const res = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: { Authorization: `Client-ID ${config.imgurClientId}` },
      body: formData,
    });
    if (!res.ok) throw new Error(`Imgur API ${res.status}`);
    const data = (await res.json()) as { data: { link: string } };
    return data.data?.link ?? null;
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Imgur error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 13. Reddit API officielle ───────────────────────────────────────────────

let redditToken: string | null = null;
let redditTokenExpiry = 0;

async function getRedditToken(): Promise<string | null> {
  if (!config.redditClientId || !config.redditClientSecret) return null;
  if (redditToken && Date.now() < redditTokenExpiry) return redditToken;

  try {
    const creds = Buffer.from(`${config.redditClientId}:${config.redditClientSecret}`).toString(
      "base64",
    );
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "User-Agent": config.redditUserAgent || "bot:discord:1.0",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    if (!res.ok) throw new Error(`Reddit token ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    redditToken = data.access_token;
    redditTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return redditToken;
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Reddit token error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function getRedditPosts(
  subreddit: string,
  limit = 10,
): Promise<
  Array<{ title: string; url: string; score: number; author: string; createdUtc: number }>
> {
  const token = await getRedditToken();
  if (!token) return [];

  try {
    const url = `https://oauth.reddit.com/r/${subreddit}/new?limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": config.redditUserAgent || "bot:discord:1.0",
      },
    });
    if (!res.ok) throw new Error(`Reddit API ${res.status}`);
    const data = (await res.json()) as {
      data: {
        children: Array<{
          data: { title: string; url: string; score: number; author: string; created_utc: number };
        }>;
      };
    };

    return (data.data?.children ?? []).map((c) => ({
      title: c.data.title,
      url: c.data.url,
      score: c.data.score,
      author: c.data.author,
      createdUtc: c.data.created_utc,
    }));
  } catch (error) {
    logger.warn(
      `[ExternalAPI] Reddit posts error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getApiStatus(): Record<string, boolean> {
  return {
    perspective: !!config.perspectiveApiKey,
    tenor: !!config.tenorApiKey,
    youtube: !!config.youtubeApiKey,
    spotify: !!config.spotifyClientId && !!config.spotifyClientSecret,
    rawg: !!config.rawgApiKey,
    newsapi: !!config.newsApiKey,
    cheapshark: true,
    screenshot: !!config.screenshotApiKey,
    huggingface: !!config.hfApiKey,
    lastfm: !!config.lastfmApiKey,
    phisherman: !!config.phishermanApiKey,
    imgur: !!config.imgurClientId,
    reddit: !!config.redditClientId && !!config.redditClientSecret,
  };
}
