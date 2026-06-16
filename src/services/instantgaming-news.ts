import logger from "../utils/logger";
import cron from "node-cron";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import {
  Client,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import prisma from "../prisma";
import { config } from "../config";
import { sendErrorLog } from "./logs";
import { dedupCache } from "../utils/deduplicationCache";

const NEWS_BASE = "https://news.instant-gaming.com";
const NEWS_FEED_URL = NEWS_BASE + "/fr/rss.xml";
const IG_ORANGE = 0xef7f1a;

// Image de secours si aucun visuel trouvé dans l'article
const FALLBACK_IMAGE_URL = NEWS_BASE + "/assets/images/ig-logo.png";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "DNT": "1",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
};

const rssParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

interface ArticleData {
  title: string;
  url: string;
  image: string | null;
  summary: string;
  pubDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * Parse le contenu HTML d'un article pour y trouver la première balise <img src="..." />.
 */
function extractImageFromHtml(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

/**
 * Vérifie si une URL d'image est valide (non vide, commence par http/https).
 */
function isValidImageUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/**
 * Extraction robuste de l'image d'illustration d'un article RSS.
 *
 * Ordre de priorité :
 * 1. `enclosure.url` (balise <enclosure> RSS standard)
 * 2. `media:content` (namespace Media RSS, souvent utilisé par les blogs)
 * 3. `media:thumbnail` (vignette Media RSS)
 * 4. Parsing HTML de `content:encoded` pour y trouver une balise <img>
 * 5. Parsing HTML de `description` pour y trouver une balise <img>
 * 6. URL de secours (logo Instant Gaming)
 */
function extractArticleImage(item: Record<string, any>): string | null {
  // 1. enclosure (standard RSS)
  const enclosureUrl =
    item.enclosure?.["@_url"] ?? item.enclosure?.url ?? null;
  if (isValidImageUrl(enclosureUrl)) return enclosureUrl;

  // 2. media:content (peut etre un objet ou un tableau)
  const mediaContent = item["media:content"];
  if (mediaContent) {
    const mcFirst = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;
    // Attribut url="..." (prefixe @_ du parser) ou element enfant <url>...</url>
    const mcUrl = mcFirst?.["@_url"] ?? mcFirst?.url ?? null;
    if (isValidImageUrl(mcUrl)) return mcUrl;
  }

  // 3. media:thumbnail
  const mediaThumb = item["media:thumbnail"];
  if (mediaThumb) {
    const mtFirst = Array.isArray(mediaThumb) ? mediaThumb[0] : mediaThumb;
    const mtUrl = mtFirst?.["@_url"] ?? mtFirst?.url ?? null;
    if (isValidImageUrl(mtUrl)) return mtUrl;
  }

  // 4. Parsing HTML de content:encoded (RSS 2.0)
  const encoded = item["content:encoded"];
  if (typeof encoded === "string") {
    const img = extractImageFromHtml(encoded);
    if (isValidImageUrl(img)) return img;
  }

  // 5. Parsing HTML de content (Atom) ou contentSnippet
  const contentField = item.content ?? item.contentSnippet;
  if (typeof contentField === "string") {
    const img = extractImageFromHtml(contentField);
    if (isValidImageUrl(img)) return img;
  }

  // 6. Parsing HTML de description
  const desc = item.description;
  if (typeof desc === "string") {
    const img = extractImageFromHtml(desc);
    if (isValidImageUrl(img)) return img;
  }

  // 7. Aucune image trouvee
  return null;
}

// ─── Fetch RSS ────────────────────────────────────────────────────────────────

async function fetchNewsRSS(): Promise<ArticleData[]> {
  try {
    const response = await axios.get(NEWS_FEED_URL, {
      headers: HEADERS,
      timeout: 15000,
      maxRedirects: 5,
    });

    const parsed = rssParser.parse(response.data);
    const channel = parsed?.rss?.channel;
    if (!channel || !channel.item) {
      logger.warn("[IG News] Flux RSS vide ou invalide.");
      return [];
    }

    const items = Array.isArray(channel.item)
      ? channel.item
      : [channel.item];

    const articles: ArticleData[] = [];

    for (const item of items) {
      const title = cleanTitle(item.title || "");
      const url = item.link || "";
      const pubDate = item.pubDate || "";

      let summary = "";
      if (item.description) {
        summary = stripHtml(item.description);
      }

      // Extraction robuste de l'image
      const image = extractArticleImage(item);

      if (title && url) {
        articles.push({ title, url, image, summary, pubDate });
      }
    }

    return articles;
  } catch (error) {
    logger.error(
      "[IG News] Erreur RSS:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

// ─── Send Embed ───────────────────────────────────────────────────────────────

async function sendNewsEmbed(
  client: Client,
  article: ArticleData
): Promise<void> {
  // Priorité au GAMING_BLOG_CHANNEL_ID, fallback sur INSTANT_GAMING_CHANNEL_ID
  const channelId = config.gamingBlogChannel || config.instantGamingChannel;
  if (!channelId) {
    logger.warn(
      "[IG News] Aucun salon configuré (GAMING_BLOG_CHANNEL_ID / INSTANT_GAMING_CHANNEL_ID)."
    );
    return;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    logger.warn("[IG News] Salon introuvable ou non textuel.");
    return;
  }

  const parts: string[] = [];
  if (article.summary) {
    parts.push(truncateText(article.summary, 300));
  }
  parts.push("\n\n[Lire l'article complet](" + article.url + ")");

  const embed = new EmbedBuilder()
    .setTitle("\uD83D\uDCF0 " + article.title)
    .setDescription(parts.join("\n"))
    .setColor(IG_ORANGE)
    .setFooter({
      text: "Instant Gaming \u2022 Actualit\u00E9s",
      iconURL: NEWS_BASE + "/assets/images/favicon.png",
    })
    .setTimestamp();

  if (article.pubDate) {
    embed.addFields({
      name: "\uD83D\uDCC5 Date",
      value: article.pubDate,
      inline: true,
    });
  }

  // Image de l'article (extraite ou fallback)
  const imageUrl =
    article.image && isValidImageUrl(article.image)
      ? article.image
      : FALLBACK_IMAGE_URL;

  embed.setImage(imageUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("\uD83D\uDCF0 Lire l'article")
      .setStyle(ButtonStyle.Link)
      .setURL(article.url)
  );

  await (channel as TextChannel).send({
    embeds: [embed],
    components: [row],
  });

  logger.info("[IG News] Article envoy\u00E9 : " + article.title);
}

// ─── Check & Scheduling ───────────────────────────────────────────────────────

let isCheckingNews = false;

export async function checkInstantGamingNews(
  client: Client
): Promise<void> {
  // 🔒 Recharge le cache anti-doublon depuis le disque (persistance inter-cycles)
  await dedupCache.reloadFromDisk();
  if (isCheckingNews) return;
  isCheckingNews = true;

  try {
    logger.info("[IG News] V\u00E9rification des actus...");

    const articles = (await fetchNewsRSS()).slice(0, 5);
    if (articles.length === 0) {
      logger.info("[IG News] Aucun article extrait.");
      return;
    }

    let newCount = 0;

    for (const article of articles) {
      try {
        await prisma.notification.upsert({
          where: { url: article.url },
          update: {},
          create: {
            sourceId: "ig-news",
            content: article.title,
            url: article.url,
            platform: "instantgaming_news",
          },
        });

        newCount++;
        logger.info("[IG News] Nouvel article : " + article.title);
      } catch (error: unknown) {
        // Autre erreur : on laisse passer pour ne pas bloquer le flux
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`[IG News] Erreur article: ${article.url} ${err.message}`, { stack: err.stack });
        await sendErrorLog("IG News article", err, client);
        continue;
      }

      try {
        await sendNewsEmbed(client, article);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("[IG News] Erreur d'envoi:", err.message);
        await sendErrorLog("IG News sendNewsEmbed", err, client);
      }
    }

    logger.info(
      "[IG News] Termin\u00E9 : " +
        newCount +
        " nouveau(x), " +
        articles.length +
        " v\u00E9rifi\u00E9(s)"
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("[IG News] Erreur globale:", err.message);
    await sendErrorLog("IG News check", err, client);
  } finally {
    isCheckingNews = false;
  }
}

let newsCronJob: any = null;

export function startInstantGamingNewsCheck(client: Client): void {
  if ((newsCronJob as any)) {
    logger.warn("[IG News] Surveillance actus déjà active.");
    return;
  }

  logger.info("[IG News] ⏱️ Exécution Cron planifiée pour Instant Gaming — toutes les 15 minutes");

  newsCronJob = cron.schedule("*/15 * * * *", () => {
    logger.info("[IG News] ⏱️ Exécution Cron planifiée pour Instant Gaming");
    checkInstantGamingNews(client).catch(
      (err) => logger.error("[IG News] Erreur cron:", String(err))
    );
  });
}
export function stopInstantGamingNewsCheck(): void {
  if ((newsCronJob as any)) {
    (newsCronJob as any).stop();
    newsCronJob = null;
    logger.info("[IG News] Surveillance actus arrêtée.");
  }
}

// Export pour les tests unitaires
export { fetchNewsRSS, extractArticleImage, extractImageFromHtml, isValidImageUrl };
