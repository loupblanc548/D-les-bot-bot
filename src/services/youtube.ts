import logger from "../utils/logger.js";
// Resolution @handle YouTube → channel ID (UC...)
// Utilise le page scraping (pas de quota API)

const CACHE = new Map<string, string>();

export async function resolveYouTubeChannelId(handle: string): Promise<string | null> {
  const cleanHandle = handle.replace("@", "").trim();
  
  // Si c'est deja un channel ID UC..., retourner directement
  if (/^UC[\w-]{22,}$/.test(cleanHandle)) {
    return cleanHandle;
  }
  
  // Cache
  if (CACHE.has(cleanHandle)) {
    return CACHE.get(cleanHandle)!;
  }

  try {
    const url = `https://www.youtube.com/@${cleanHandle}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
    });
    if (!response.ok) {
      logger.warn(`[YouTube] HTTP ${response.status} pour @${cleanHandle}`);
      return null;
    }
    
    const text = await response.text();
    
    // Extraire externalId du HTML
    const match = text.match(/"externalId"\s*:\s*"(UC[\w-]{22,})"/);
    if (match) {
      const channelId = match[1];
      CACHE.set(cleanHandle, channelId);
      logger.info(`[YouTube] @${cleanHandle} → ${channelId}`);
      return channelId;
    }
    
    // Fallback: chercher un browse_id ou channelId dans le JSON integre
    const altMatch = text.match(/"channelId"\s*:\s*"(UC[\w-]{22,})"/);
    if (altMatch) {
      const channelId = altMatch[1];
      CACHE.set(cleanHandle, channelId);
      logger.info(`[YouTube] @${cleanHandle} → ${channelId} (fallback)`);
      return channelId;
    }
    
    logger.warn(`[YouTube] ID introuvable pour @${cleanHandle}`);
    return null;
  } catch (err) {
    logger.error(`[YouTube] Erreur resolution @${cleanHandle}:`, String(err));
    return null;
  }
}

// Conversion handle → URL flux RSS YouTube
// Utilise le channel ID UC... pour un flux RSS fiable
export async function getYouTubeRssUrl(handle: string): Promise<string | null> {
  const channelId = await resolveYouTubeChannelId(handle);
  if (channelId) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  }
  return null;
}
