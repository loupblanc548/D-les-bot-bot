/**
 * googleCloudServices.ts — Google Cloud Services Integration
 *
 * Utilise une seule clé API Google Cloud pour accéder à :
 *  1. Cloud Translation API — traduction de texte (v3)
 *  2. Cloud Vision API — analyse d'images (labels, texte, modération)
 *  3. Cloud Natural Language API — analyse de sentiment, entités, classification
 *
 * Le bot utilise automatiquement ces services pour :
 *  - Traduire les messages suspects
 *  - Analyser les images pour détecter du contenu inapproprié
 *  - Analyser le sentiment des messages pour la modération
 */

import logger from "../utils/logger.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const GOOGLE_API_KEY = process.env.GOOGLE_SAFE_BROWSING_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const cache = new Map<string, { data: unknown; timestamp: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data as T;
  return null;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > 300) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage: string;
  targetLanguage: string;
  confidence: number;
}

export interface VisionResult {
  labels: { description: string; score: number }[];
  text: string | null;
  safeSearch: {
    adult: "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";
    medical: "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";
    violence: "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";
    racy: "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";
  } | null;
  faces: { joy: number; sorrow: number; anger: number; surprise: number }[];
  logos: { description: string; score: number }[];
  isUnsafe: boolean;
}

export interface LanguageAnalysisResult {
  sentiment: { score: number; magnitude: number } | null;
  entities: { name: string; type: string; salience: number }[];
  categories: { name: string; confidence: number }[];
  language: string;
  isToxic: boolean;
  toxicityScore: number;
}

// ─── 1. Cloud Translation API ────────────────────────────────────────────────

/**
 * Traduit un texte vers une langue cible.
 * Endpoint: https://translation.googleapis.com/language/translate/v2
 */
export async function translateText(
  text: string,
  targetLang: string = "en",
  sourceLang?: string,
): Promise<TranslationResult> {
  const cacheKey = `tr_${text.slice(0, 50)}_${targetLang}_${sourceLang ?? "auto"}`;
  const cached = getCached<TranslationResult>(cacheKey);
  if (cached) return cached;

  const result: TranslationResult = {
    translatedText: text,
    detectedSourceLanguage: sourceLang ?? "unknown",
    targetLanguage: targetLang,
    confidence: 0,
  };

  if (!GOOGLE_API_KEY) {
    logger.warn("[GoogleCloud] Translation: no API key configured");
    return result;
  }

  try {
    const body: Record<string, unknown> = {
      q: text.slice(0, 5000),
      target: targetLang,
      format: "text",
    };
    if (sourceLang) body.source = sourceLang;

    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      logger.warn(`[GoogleCloud] Translation HTTP ${res.status}`);
      return result;
    }

    const data = (await res.json()) as any;
    const translation = data?.data?.translations?.[0];

    if (translation) {
      result.translatedText = translation.translatedText ?? text;
      result.detectedSourceLanguage = translation.detectedSourceLanguage ?? sourceLang ?? "unknown";
      result.confidence = 0.9;
    }

    setCached(cacheKey, result);
  } catch (error) {
    logger.warn(
      `[GoogleCloud] Translation error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}

/**
 * Détecte la langue d'un texte.
 */
export async function detectLanguage(
  text: string,
): Promise<{ language: string; confidence: number }> {
  if (!GOOGLE_API_KEY) return { language: "unknown", confidence: 0 };

  try {
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2/detect?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text.slice(0, 5000) }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) return { language: "unknown", confidence: 0 };

    const data = (await res.json()) as any;
    const detection = data?.data?.detections?.[0]?.[0];
    return {
      language: detection?.language ?? "unknown",
      confidence: detection?.confidence ?? 0,
    };
  } catch {
    return { language: "unknown", confidence: 0 };
  }
}

// ─── 2. Cloud Vision API ─────────────────────────────────────────────────────

/**
 * Analyse une image (URL ou base64).
 * Endpoint: https://vision.googleapis.com/v1/images:annotate
 */
export async function analyzeImage(imageUrl?: string, imageBase64?: string): Promise<VisionResult> {
  const cacheKey = `vision_${imageUrl ?? imageBase64?.slice(0, 50) ?? "empty"}`;
  const cached = getCached<VisionResult>(cacheKey);
  if (cached) return cached;

  const result: VisionResult = {
    labels: [],
    text: null,
    safeSearch: null,
    faces: [],
    logos: [],
    isUnsafe: false,
  };

  if (!GOOGLE_API_KEY) {
    logger.warn("[GoogleCloud] Vision: no API key configured");
    return result;
  }

  const image: Record<string, string> = {};
  if (imageUrl) image.source = { imageUri: imageUrl } as any;
  if (imageBase64) image.content = imageBase64;

  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image,
              features: [
                { type: "LABEL_DETECTION", maxResults: 10 },
                { type: "TEXT_DETECTION", maxResults: 5 },
                { type: "SAFE_SEARCH_DETECTION" },
                { type: "FACE_DETECTION", maxResults: 5 },
                { type: "LOGO_DETECTION", maxResults: 5 },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      logger.warn(`[GoogleCloud] Vision HTTP ${res.status}`);
      return result;
    }

    const data = (await res.json()) as any;
    const response = data?.responses?.[0];

    if (response?.labelAnnotations) {
      result.labels = response.labelAnnotations.map((l: any) => ({
        description: l.description ?? "",
        score: l.score ?? 0,
      }));
    }

    if (response?.textAnnotations?.[0]) {
      result.text = response.textAnnotations[0].description ?? null;
    }

    if (response?.safeSearchAnnotation) {
      const ss = response.safeSearchAnnotation;
      result.safeSearch = {
        adult: ss.adult ?? "VERY_UNLIKELY",
        medical: ss.medical ?? "VERY_UNLIKELY",
        violence: ss.violence ?? "VERY_UNLIKELY",
        racy: ss.racy ?? "VERY_UNLIKELY",
      };

      result.isUnsafe =
        ss.adult === "LIKELY" ||
        ss.adult === "VERY_LIKELY" ||
        ss.violence === "LIKELY" ||
        ss.violence === "VERY_LIKELY" ||
        ss.racy === "LIKELY" ||
        ss.racy === "VERY_LIKELY";
    }

    if (response?.faceAnnotations) {
      result.faces = response.faceAnnotations.map((f: any) => ({
        joy: f.joyLikelihood ? likelihoodToScore(f.joyLikelihood) : 0,
        sorrow: f.sorrowLikelihood ? likelihoodToScore(f.sorrowLikelihood) : 0,
        anger: f.angerLikelihood ? likelihoodToScore(f.angerLikelihood) : 0,
        surprise: f.surpriseLikelihood ? likelihoodToScore(f.surpriseLikelihood) : 0,
      }));
    }

    if (response?.logoAnnotations) {
      result.logos = response.logoAnnotations.map((l: any) => ({
        description: l.description ?? "",
        score: l.score ?? 0,
      }));
    }

    setCached(cacheKey, result);
    logger.info(`[GoogleCloud] Vision: ${result.labels.length} labels, unsafe=${result.isUnsafe}`);
  } catch (error) {
    logger.warn(
      `[GoogleCloud] Vision error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}

function likelihoodToScore(likelihood: string): number {
  const map: Record<string, number> = {
    VERY_UNLIKELY: 0,
    UNLIKELY: 0.25,
    POSSIBLE: 0.5,
    LIKELY: 0.75,
    VERY_LIKELY: 1,
  };
  return map[likelihood] ?? 0;
}

// ─── 3. Cloud Natural Language API ───────────────────────────────────────────

/**
 * Analyse un texte : sentiment, entités, classification.
 * Endpoint: https://language.googleapis.com/v1/documents:analyzeSentiment
 */
export async function analyzeText(text: string): Promise<LanguageAnalysisResult> {
  const cacheKey = `lang_${text.slice(0, 80)}`;
  const cached = getCached<LanguageAnalysisResult>(cacheKey);
  if (cached) return cached;

  const result: LanguageAnalysisResult = {
    sentiment: null,
    entities: [],
    categories: [],
    language: "en",
    isToxic: false,
    toxicityScore: 0,
  };

  if (!GOOGLE_API_KEY) {
    logger.warn("[GoogleCloud] Natural Language: no API key configured");
    return result;
  }

  const document = {
    type: "PLAIN_TEXT",
    content: text.slice(0, 5000),
  };

  try {
    // 1. Sentiment analysis
    const sentimentRes = await fetch(
      `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (sentimentRes.ok) {
      const sentimentData = (await sentimentRes.json()) as any;
      result.sentiment = {
        score: sentimentData?.documentSentiment?.score ?? 0,
        magnitude: sentimentData?.documentSentiment?.magnitude ?? 0,
      };
      result.language = sentimentData?.language ?? "en";
    }

    // 2. Entity analysis
    const entityRes = await fetch(
      `https://language.googleapis.com/v1/documents:analyzeEntities?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (entityRes.ok) {
      const entityData = (await entityRes.json()) as any;
      result.entities = (entityData?.entities ?? []).map((e: any) => ({
        name: e.name ?? "",
        type: e.type ?? "UNKNOWN",
        salience: e.salience ?? 0,
      }));
    }

    // 3. Text classification
    const classifyRes = await fetch(
      `https://language.googleapis.com/v1/documents:classifyText?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (classifyRes.ok) {
      const classifyData = (await classifyRes.json()) as any;
      result.categories = (classifyData?.categories ?? []).map((c: any) => ({
        name: c.name ?? "",
        confidence: c.confidence ?? 0,
      }));
    }

    // Calculer un score de toxicité basé sur le sentiment négatif
    if (result.sentiment) {
      result.toxicityScore =
        Math.max(0, -result.sentiment.score) * Math.min(1, result.sentiment.magnitude);
      result.isToxic = result.toxicityScore > 0.6;
    }

    setCached(cacheKey, result);
    logger.info(
      `[GoogleCloud] Language: sentiment=${result.sentiment?.score ?? "?"}, toxic=${result.isToxic}, entities=${result.entities.length}`,
    );
  } catch (error) {
    logger.warn(
      `[GoogleCloud] Natural Language error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}

// ─── API publique ────────────────────────────────────────────────────────────

export function isGoogleCloudConfigured(): boolean {
  return !!GOOGLE_API_KEY;
}

export function clearGoogleCloudCache(): void {
  cache.clear();
}

export function getGoogleCloudCacheSize(): number {
  return cache.size;
}

// ─── 4. YouTube Data API v3 ──────────────────────────────────────────────────

export interface YouTubeVideoResult {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  duration: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  tags: string[];
  isLive: boolean;
}

export interface YouTubeSearchResult {
  query: string;
  totalResults: number;
  videos: YouTubeVideoResult[];
  scannedAt: Date;
}

/**
 * Recherche des vidéos YouTube.
 * Endpoint: https://www.googleapis.com/youtube/v3/search
 */
export async function searchYouTube(
  query: string,
  maxResults: number = 5,
): Promise<YouTubeSearchResult> {
  const cacheKey = `yt_search_${query}_${maxResults}`;
  const cached = getCached<YouTubeSearchResult>(cacheKey);
  if (cached) return cached;

  const result: YouTubeSearchResult = {
    query,
    totalResults: 0,
    videos: [],
    scannedAt: new Date(),
  };

  if (!GOOGLE_API_KEY) {
    logger.warn("[GoogleCloud] YouTube: no API key configured");
    return result;
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&key=${GOOGLE_API_KEY}`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (!res.ok) {
      logger.warn(`[GoogleCloud] YouTube search HTTP ${res.status}`);
      return result;
    }

    const data = (await res.json()) as any;
    result.totalResults = data?.pageInfo?.totalResults ?? 0;

    const videoIds = (data?.items ?? []).map((item: any) => item?.id?.videoId).filter(Boolean);

    // Fetch video details (statistics, content details)
    const videoDetails: Record<string, any> = {};
    if (videoIds.length > 0) {
      const detailsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds.join(",")}&key=${GOOGLE_API_KEY}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (detailsRes.ok) {
        const detailsData = (await detailsRes.json()) as any;
        for (const item of detailsData?.items ?? []) {
          videoDetails[item.id] = item;
        }
      }
    }

    result.videos = (data?.items ?? []).map((item: any) => {
      const id = item?.id?.videoId ?? "";
      const details = videoDetails[id];
      const snippet = details?.snippet ?? item?.snippet ?? {};

      return {
        videoId: id,
        title: snippet?.title ?? "",
        description: (snippet?.description ?? "").slice(0, 500),
        channelId: snippet?.channelId ?? "",
        channelTitle: snippet?.channelTitle ?? "",
        publishedAt: snippet?.publishedAt ?? "",
        thumbnail: snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url ?? "",
        duration: details?.contentDetails?.duration ?? null,
        viewCount: details?.statistics?.viewCount ? parseInt(details.statistics.viewCount) : null,
        likeCount: details?.statistics?.likeCount ? parseInt(details.statistics.likeCount) : null,
        commentCount: details?.statistics?.commentCount
          ? parseInt(details.statistics.commentCount)
          : null,
        tags: details?.snippet?.tags ?? [],
        isLive: snippet?.liveBroadcastContent === "live",
      };
    });

    setCached(cacheKey, result);
    logger.info(`[GoogleCloud] YouTube: ${result.videos.length} videos for "${query}"`);
  } catch (error) {
    logger.warn(
      `[GoogleCloud] YouTube search error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}

/**
 * Récupère les détails d'une vidéo YouTube par son ID.
 */
export async function getYouTubeVideo(videoId: string): Promise<YouTubeVideoResult | null> {
  const cacheKey = `yt_video_${videoId}`;
  const cached = getCached<YouTubeVideoResult>(cacheKey);
  if (cached) return cached;

  if (!GOOGLE_API_KEY) return null;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${GOOGLE_API_KEY}`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (!res.ok) return null;

    const data = (await res.json()) as any;
    const item = data?.items?.[0];
    if (!item) return null;

    const snippet = item.snippet ?? {};
    const stats = item.statistics ?? {};
    const content = item.contentDetails ?? {};

    const result: YouTubeVideoResult = {
      videoId,
      title: snippet.title ?? "",
      description: (snippet.description ?? "").slice(0, 500),
      channelId: snippet.channelId ?? "",
      channelTitle: snippet.channelTitle ?? "",
      publishedAt: snippet.publishedAt ?? "",
      thumbnail: snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? "",
      duration: content.duration ?? null,
      viewCount: stats.viewCount ? parseInt(stats.viewCount) : null,
      likeCount: stats.likeCount ? parseInt(stats.likeCount) : null,
      commentCount: stats.commentCount ? parseInt(stats.commentCount) : null,
      tags: snippet.tags ?? [],
      isLive: snippet.liveBroadcastContent === "live",
    };

    setCached(cacheKey, result);
    return result;
  } catch (error) {
    logger.warn(
      `[GoogleCloud] YouTube video error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Vérifie si une vidéo YouTube contient du contenu suspect (scam, spam, phishing).
 * Détecte les mots-clés suspects dans le titre et la description.
 */
export async function checkYouTubeVideoSafety(videoId: string): Promise<{
  video: YouTubeVideoResult | null;
  isSuspicious: boolean;
  reasons: string[];
}> {
  const video = await getYouTubeVideo(videoId);
  if (!video) {
    return { video: null, isSuspicious: false, reasons: [] };
  }

  const reasons: string[] = [];
  const text = `${video.title} ${video.description}`.toLowerCase();

  const suspiciousPatterns = [
    "free nitro",
    "free discord nitro",
    "steam gift",
    "free steam",
    "click my link",
    "subscribe for",
    "giveaway click",
    "bit.ly",
    "shorturl",
    "tinyurl",
    "free robux",
    "free vbucks",
    "paypal money",
    "free money",
    "crypto giveaway",
    "bitcoin giveaway",
    "dm me",
    "add me",
    "whatsapp me",
    "click link in description",
  ];

  for (const pattern of suspiciousPatterns) {
    if (text.includes(pattern)) {
      reasons.push(`Mot-clé suspect: "${pattern}"`);
    }
  }

  // Vues très basses avec beaucoup de tags = possible spam
  if (video.viewCount !== null && video.viewCount < 100 && video.tags.length > 15) {
    reasons.push("Vues très basses avec beaucoup de tags (spam possible)");
  }

  // Description très courte avec lien = possible scam
  if (video.description.length < 50 && text.includes("http")) {
    reasons.push("Description très courte avec lien (scam possible)");
  }

  return {
    video,
    isSuspicious: reasons.length > 0,
    reasons,
  };
}
