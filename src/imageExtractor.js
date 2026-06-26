// src/imageExtractor.js
// @ts-check
/**
 * imageExtractor.js — chaîne d'extraction d'illustration pour les embeds RSS.
 *
 * Ordre de résolution :
 *   1. item.enclosure.url
 *   2. item['media:content'] (avec fallback media_content / media:thumbnail)
 *   3. <img src="..."> dans content / content:encoded / contentSnippet / summary
 *   4. Steam AppID détecté via regex sur link/title → bannière Akamai
 *   5. RAWG fallback (si ctx.rawgClient fourni + activé + règle non-agrégateur)
 */

const IMG_EXT_RE = /\.(png|jpe?g|gif|webp)(\?|#|$)/i;
const HTML_IMG_RE = /<img[^>]+src=["']([^"']+)["']/i;
const STEAM_APP_RE = /store\.steampowered\.com\/app\/(\d+)/i;
const HTML_KEYS = /** @type {const} */ (['content:encoded', 'content', 'contentSnippet', 'summary']);

/**
 * @param {string} url
 */
function isHttpUrl(url) {
  return typeof url === 'string' && url.length > 0 && /^https?:\/\//i.test(url);
}

/**
 * @param {unknown} item
 * @param {{ channelEnv?: string, name?: string }} [rule]
 * @param {{ rawgClient?: import('./rawgClient.js').RawgClient | null, signal?: AbortSignal }} [ctx]
 * @returns {Promise<string|null>}
 */
export async function extractImage(item, rule, ctx) {
  if (!item || typeof item !== 'object') return null;
  const it = /** @type {Record<string, unknown>} */ (item);

  // 1) enclosure
  const encUrl = /** @type {{ url?: unknown } | undefined} */ (/** @type {any} */ (it).enclosure)?.url;
  if (typeof encUrl === 'string' && looksLikeImageUrl(encUrl)) return encUrl;

  // 2) media:content (essayé dans les deux conventions rss-parser : raw + underscored + thumbnail)
  const mediaUrl = pickMediaContentUrl(it);
  if (mediaUrl && looksLikeImageUrl(mediaUrl)) return mediaUrl;

  // 3) HTML <img src="..."> sur les champs CMS courants
  const htmlSource = pickHtmlSource(it);
  if (htmlSource) {
    const m = HTML_IMG_RE.exec(htmlSource);
    if (m && typeof m[1] === 'string' && looksLikeImageUrl(m[1])) return m[1];
  }

  // 4) Steam AppID dans link/title/content : renvoie la bannière Akamai.
  const linkHay = [it.link, it.title, /** @type {any} */ (it)['content:encoded'], it.content]
    .map((s) => (typeof s === 'string' ? s : ''))
    .join('\n');
  const steamMatch = STEAM_APP_RE.exec(linkHay);
  if (steamMatch && typeof steamMatch[1] === 'string') {
    return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamMatch[1]}/header.jpg`;
  }

  // 5) RAWG fallback — uniquement si activé et règle exploitable.
  if (ctx && ctx.rawgClient && typeof ctx.rawgClient.isEnabled === 'function' && ctx.rawgClient.isEnabled() && !isDealAggregator(rule)) {
    const title = typeof it.title === 'string' ? it.title.trim() : '';
    if (title.length > 0) {
      try {
        const game = await ctx.rawgClient.searchByTitle(title, { signal: ctx.signal });
        if (game && typeof game.background_image === 'string') return game.background_image;
      } catch (err) {
        const lg = /** @type {any} */ (ctx.rawgClient).logger;
        lg?.warn?.('[imageExtractor] RAWG a planté pour', title, err instanceof Error ? err.message : err);
      }
    }
  }

  return null;
}

/** @param {string} url */
function looksLikeImageUrl(url) {
  if (!isHttpUrl(url)) return false;
  if (IMG_EXT_RE.test(url)) return true;
  return /cdn|media|image|img|rawg|steamstatic|akamai|store/i.test(url);
}

/** @param {Record<string, unknown>} it */
function pickMediaContentUrl(it) {
  // rss-parser : namespaces peuvent apparaître sous la forme raw (media:content)
  // ou underscored (media_content). On tente les 4 variantes courantes.
  let v = it['media:content'];
  if (v === undefined || v === null) v = it.media_content;
  if (v === undefined || v === null) v = it['media:thumbnail'];
  if (v === undefined || v === null) v = it.media_thumbnail;
  if (Array.isArray(v) && v.length > 0) v = v[0];
  if (!v || typeof v !== 'object') return null;
  const rec = /** @type {Record<string, unknown>} */ (v);
  const dollar = rec.$;
  if (dollar && typeof dollar === 'object') {
    const u = /** @type {Record<string, unknown>} */ (dollar).url;
    if (typeof u === 'string') return u;
  }
  if (typeof rec.url === 'string') return rec.url;
  return null;
}

/** @param {Record<string, unknown>} it */
function pickHtmlSource(it) {
  for (const key of HTML_KEYS) {
    const v = it[key];
    if (typeof v === 'string' && v.length > 0 && v.toLowerCase().includes('<img')) return v;
  }
  return null;
}

/** @param {{ channelEnv?: string, name?: string }|undefined} rule */
function isDealAggregator(rule) {
  if (!rule) return false;
  const env = String(rule.channelEnv ?? '').toUpperCase();
  if (env === 'INSTANT_GAMING_CHANNEL_ID') return true;
  const name = String(rule.name ?? '').toLowerCase();
  return name.includes('instant gaming') || name.includes('aggregator') || name.includes('agregator');
}

export default extractImage;
