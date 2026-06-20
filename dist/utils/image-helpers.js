// Helpers centralisés pour les images dans les embeds Discord
// Utilisés par feeds.ts, monitor.ts, patchNotes.ts
// Cache simple (Map) avec TTL de 10 minutes pour éviter de refetch la même URL
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const urlCache = new Map();
// Éviction au moment de l'écriture (pas de timer permanent)
let lastSweep = 0;
const SWEEP_COOLDOWN_MS = 60_000;
function sweepExpired() {
    const now = Date.now();
    if (now - lastSweep < SWEEP_COOLDOWN_MS)
        return;
    lastSweep = now;
    for (const [key, { ts }] of urlCache) {
        if (now - ts >= CACHE_TTL_MS)
            urlCache.delete(key);
    }
}
function withCache(key, fetcher) {
    const cached = urlCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return Promise.resolve(cached.data);
    }
    return fetcher().then((data) => {
        sweepExpired();
        urlCache.set(key, { data, ts: Date.now() });
        return data;
    });
}
/**
 * Extrait la miniature YouTube depuis les métadonnées RSS/Atom d'un item de flux.
 * Formats supportés :
 *   - RSS  : <media:thumbnail url="..." />
 *   - Atom : <media:group><media:thumbnail url="..." /></media:group>
 * Dans le flux Atom YouTube, les miniatures sont triées par taille ;
 * la dernière est maxresdefault (la plus grande).
 */
export function extractMediaThumbnail(item) {
    // Format RSS standard : <media:thumbnail url="..." />
    const directThumb = item["media:thumbnail"];
    if (directThumb?.["@_url"])
        return directThumb["@_url"];
    // Format Atom YouTube : <media:group><media:thumbnail url="..." /></media:group>
    const mediaGroup = item["media:group"];
    if (mediaGroup) {
        const thumb = mediaGroup["media:thumbnail"];
        if (thumb) {
            if (Array.isArray(thumb)) {
                return thumb[thumb.length - 1]?.["@_url"] || thumb[0]?.["@_url"];
            }
            return thumb["@_url"];
        }
    }
    return undefined;
}
export async function getYouTubeThumbnail(url) {
    return withCache("yt:" + url, async () => {
        try {
            const match = url.match(/(?:youtube\.com\/watch\?(?:.*[?&])?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
            if (!match)
                return null;
            const videoId = match[1];
            const maxresUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            // Vérifier si maxresdefault existe, sinon fallback hqdefault
            try {
                const head = await fetch(maxresUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
                if (head.ok)
                    return maxresUrl;
            }
            catch { }
            return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
        catch {
            return null;
        }
    });
}
export async function getOgImage(url) {
    return withCache("og:" + url, async () => {
        try {
            const res = await fetch(url, { headers: { "User-Agent": "DiscordSurveillanceBot/1.0" }, signal: AbortSignal.timeout(5000) });
            if (!res.ok)
                return null;
            const html = await res.text();
            const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
            if (match)
                return match[1];
            return null;
        }
        catch {
            return null;
        }
    });
}
// Extraction d'images pour les articles de blog :
// 1. Fetch la page une seule fois
// 2. Tente d'abord l'Open Graph (og:image) dans le HTML
// 3. Fallback : scrape les balises <img> du corps de l'article
// Filtre les images trop petites, icônes, pixels de tracking, etc.
export async function getBlogImage(url) {
    return withCache("blog:" + url, async () => {
        try {
            // Une seule requête HTTP pour toute la logique
            const res = await fetch(url, {
                headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok)
                return null;
            const html = await res.text();
            // Étape 1 : tenter l'Open Graph (og:image) dans le HTML déjà récupéré
            const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
            if (ogMatch)
                return ogMatch[1];
            // Étape 2 : fallback <img> scraping
            const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
            const candidates = [];
            let m;
            while ((m = imgRegex.exec(html)) !== null) {
                const src = m[1];
                // Ignorer les images manifestement non pertinentes
                if (src.includes("data:image") || // data URIs (souvent icons inline)
                    src.includes("avatar") || // avatars
                    src.includes("/icon") || // icônes
                    src.includes("gravatar.com") || // gravatars
                    src.includes("pixel") || // pixels de tracking
                    src.includes("1x1") || // images 1x1
                    /\/\d+x\d+\.(png|jpg|gif|webp)$/i.test(src) // noms de fichier dimensionnés (ex: /150x150.png)
                ) {
                    continue;
                }
                // Garder les URLs qui ressemblent à de vraies images de contenu
                if (src.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i)) {
                    candidates.push(src);
                }
            }
            if (candidates.length > 0) {
                // Résoudre les URLs relatives avec new URL() (gère /absolu, relatif, //protocol-relatif)
                try {
                    return new URL(candidates[0], url).href;
                }
                catch {
                    return candidates[0];
                }
            }
            return null;
        }
        catch {
            return null;
        }
    });
}
// Extraction d'images Twitter : scrape les <img> du contenu du tweet sur xcancel
// Les images de tweets sont hébergées sur pbs.twimg.com
export async function getTweetImage(url) {
    return withCache("tweet:" + url, async () => {
        try {
            const res = await fetch(url, { headers: { "User-Agent": "DiscordSurveillanceBot/1.0" }, signal: AbortSignal.timeout(5000) });
            if (!res.ok)
                return null;
            const html = await res.text();
            // Chercher les balises <img> pointant vers pbs.twimg.com (images de tweets)
            const imgRegex = /<img[^>]+src=["']([^"']*pbs\.twimg\.com[^"']*)["']/gi;
            const tweetImages = [];
            let imgMatch;
            while ((imgMatch = imgRegex.exec(html)) !== null) {
                tweetImages.push(imgMatch[1]);
            }
            if (tweetImages.length > 0) {
                return tweetImages[0]; // Première image du tweet
            }
            // Fallback : miniature vidéo Twitter (video.twimg.com)
            const videoRegex = /<img[^>]+src=["']([^"']*video\.twimg\.com[^"']*)["']/gi;
            const videoThumbs = [];
            while ((imgMatch = videoRegex.exec(html)) !== null) {
                videoThumbs.push(imgMatch[1]);
            }
            if (videoThumbs.length > 0) {
                return videoThumbs[0];
            }
            // Aucune image de tweet trouvée → ne rien modifier
            return null;
        }
        catch {
            return null;
        }
    });
}
//# sourceMappingURL=image-helpers.js.map