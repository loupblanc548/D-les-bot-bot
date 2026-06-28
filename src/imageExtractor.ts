// src/imageExtractor.ts
// Extraction d'image multi-tiers pour les items RSS/flux.
// Tiers : 1) enclosure  2) media:content  3) <img> HTML  4) bannière Steam  5) RAWG.

interface ExtractRule {
  name?: string;
  channelEnv?: string;
}

interface ExtractContext {
  rawgClient?: {
    isEnabled: () => boolean;
    searchByTitle: (
      title: string,
      opts?: { signal?: AbortSignal },
    ) => Promise<{ background_image?: string | null } | null>;
  };
  signal?: AbortSignal;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i;
const IMAGE_KEYWORDS =
  /cdn|media|image|img|rawg|steamstatic|akamai|store|discord/i;

function isValidImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  return IMAGE_EXT.test(url) || IMAGE_KEYWORDS.test(url);
}

function isDealAggregator(rule?: ExtractRule): boolean {
  if (!rule) return false;
  const name = (rule.name || "").toLowerCase();
  const env = (rule.channelEnv || "").toUpperCase();
  return (
    name.includes("instant gaming") ||
    name.includes("dealabs") ||
    env.includes("INSTANT_GAMING") ||
    env.includes("DEAL")
  );
}

// ─── Tier 1 : enclosure ──────────────────────────────────────────────────────
function tryEnclosure(item: Record<string, unknown>): string | null {
  const enclosure = item.enclosure as { url?: string } | undefined;
  const url = enclosure?.url;
  return isValidImageUrl(url) ? url : null;
}

// ─── Tier 2 : media:content ──────────────────────────────────────────────────
function tryMediaContent(item: Record<string, unknown>): string | null {
  const media = item["media:content"];
  const entry = Array.isArray(media) ? media[0] : media;
  if (!entry || typeof entry !== "object") return null;
  const e = entry as { $?: { url?: string }; url?: string };
  const url = e.$?.url ?? e.url;
  return isValidImageUrl(url) ? (url as string) : null;
}

// ─── Tier 3 : <img src="..."> dans le contenu HTML ──────────────────────────
function tryHtmlImage(item: Record<string, unknown>): string | null {
  const fields = [item.content, item["content:encoded"], item.description];
  for (const field of fields) {
    if (typeof field !== "string") continue;
    const match = field.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1] && isValidImageUrl(match[1])) return match[1];
  }
  return null;
}

// ─── Tier 4 : bannière Steam à partir de l'AppID ────────────────────────────
function trySteamBanner(item: Record<string, unknown>): string | null {
  const link = typeof item.link === "string" ? item.link : "";
  const match = link.match(/store\.steampowered\.com\/app\/(\d+)/i);
  if (!match?.[1]) return null;
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${match[1]}/header.jpg`;
}

// ─── Tier 5 : recherche RAWG ─────────────────────────────────────────────────
async function tryRawg(
  item: Record<string, unknown>,
  rule: ExtractRule | undefined,
  ctx: ExtractContext,
): Promise<string | null> {
  if (!ctx.rawgClient || !ctx.rawgClient.isEnabled()) return null;
  if (isDealAggregator(rule)) return null;

  const title = typeof item.title === "string" ? item.title : "";
  if (!title) return null;

  const game = await ctx.rawgClient.searchByTitle(title, { signal: ctx.signal });
  const url = game?.background_image;
  return isValidImageUrl(url) ? (url as string) : null;
}

/**
 * Extrait l'URL d'image d'un item de flux en testant chaque tier dans l'ordre.
 * Le premier tier qui retourne une URL valide gagne.
 */
export async function extractImage(
  item: unknown,
  rule?: ExtractRule,
  ctx: ExtractContext = {},
): Promise<string | null> {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;

  return (
    tryEnclosure(obj) ??
    tryMediaContent(obj) ??
    tryHtmlImage(obj) ??
    trySteamBanner(obj) ??
    (await tryRawg(obj, rule, ctx))
  );
}

export default extractImage;
