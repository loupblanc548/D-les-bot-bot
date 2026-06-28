import { Client, TextChannel, EmbedBuilder, AttachmentBuilder } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import cron from "node-cron";
import axios from "axios";
import { config } from "../config.js";
import { retry } from "../utils/retry.js";
import { dbCache } from "../utils/cache.js";
import { validateRssItem, sanitizeString } from "../utils/validation.js";
import { metricsCollector } from "../utils/metrics.js";
import { translateAutoToFrench } from "../utils/translator.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { getOgImage } from "../utils/image-helpers.js";
import { fetchAndOptimizeImage, isOptimizableImageUrl } from "../utils/image-optimizer.js";
import { generateStableId } from "../utils/url-cleaner.js";

interface DealItem {
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
  thumbnail?: string;
  enclosure?: { url: string; type: string };
  guid?: string;
}

interface PlatformConfig {
  keywords: string[];
  channelId: string | undefined;
  color: number;
  name: string;
  defaultImage: string;
}

const RSS_FEEDS = [
  `${config.rss2jsonBaseUrl}?rss_url=${encodeURIComponent("https://www.reddit.com/r/FreeGameFindings/new.rss")}`,
  `${config.rss2jsonBaseUrl}?rss_url=${encodeURIComponent("https://www.reddit.com/r/GameDeals/new.rss")}`,
];

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    keywords: ["[Epic Games]", "Epic", "[Epic Games Store]"],
    channelId: config.steamEpicChannel,
    color: 0x2a2a2a,
    name: "Epic Games",
    defaultImage: "https://store.epicgames.com/favicon.ico",
  },
  {
    keywords: ["[Steam]", "Steam", "[GOG]"],
    channelId: config.steamEpicChannel,
    color: 0x000080,
    name: "Steam",
    defaultImage: "https://store.steampowered.com/favicon.ico",
  },
  {
    keywords: ["[PlayStation]", "PS4", "PS5", "PSN"],
    channelId: config.playstationChannel,
    color: 0x003791,
    name: "PlayStation",
    defaultImage: "https://www.playstation.com/favicon.ico",
  },
  {
    keywords: ["[Xbox]", "XBL", "Xbox Series", "Xbox One", "Microsoft"],
    channelId: config.xboxChannel,
    color: 0x107c10,
    name: "Xbox",
    defaultImage: "https://www.xbox.com/favicon.ico",
  },
  {
    keywords: ["[Nintendo]", "Switch", "eShop"],
    channelId: config.nintendoChannel,
    color: 0xe60012,
    name: "Nintendo",
    defaultImage: "https://www.nintendo.com/favicon.ico",
  },
  {
    keywords: ["Fortnite", "FN", "Battle Royale"],
    channelId: config.fortniteChannel,
    color: 0x9147ff,
    name: "Fortnite",
    defaultImage: "https://static-assets-prod.epicgames.com/fortnite/favicon.ico",
  },
  {
    keywords: ["[Instant Gaming]", "Instant Gaming", "InstantGaming"],
    channelId: config.instantGamingChannel,
    color: 0xcd7f32,
    name: "Instant Gaming",
    defaultImage: "https://www.instant-gaming.com/favicon.ico",
  },
];

let dealsCronJob: ReturnType<typeof cron.schedule> | null = null;

function detectPlatforms(title: string): PlatformConfig[] {
  const lowerTitle = title.toLowerCase();
  const detectedPlatforms: PlatformConfig[] = [];

  for (const platform of PLATFORM_CONFIGS) {
    for (const keyword of platform.keywords) {
      const kw = keyword.toLowerCase();
      // Use word boundary for short non-bracket keywords (like "Epic", "Steam")
      const isTaggedKeyword = kw.startsWith("[");
      const matches = isTaggedKeyword
        ? lowerTitle.includes(kw)
        : new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(lowerTitle);
      if (matches) {
        detectedPlatforms.push(platform);
        break;
      }
    }
  }

  return detectedPlatforms;
}

/**
 * Vérifie si un deal a déjà été traité
 * @param guid - Identifiant unique du deal
 * @returns true si le deal a déjà été traité, false sinon
 */
async function isDealProcessed(guid: string): Promise<boolean> {
  // Check cache first
  const cached = dbCache.get(guid);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const existing = await prisma.processedDeal.findUnique({
      where: { guid },
    });
    const result = !!existing;
    dbCache.set(guid, result);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`[DealsCron] Erreur verification ProcessedDeal: ${msg}`);
    return false;
  }
}

/**
 * Marque un deal comme traité dans la base de données
 * @param guid - Identifiant unique du deal
 */
async function markDealProcessed(guid: string): Promise<void> {
  try {
    await prisma.processedDeal.upsert({
      where: { guid },
      update: { guid },
      create: { guid },
    });
    // Update cache
    dbCache.set(guid, true);
  } catch (_error) {
    logger.debug("[DealsCron] Deal deja persiste, ignore");
  }
}

/**
 * Génère un GUID unique pour un deal RSS
 * @param item - Item RSS du deal
 * @returns GUID unique généré
 */
function generateDealGuid(item: DealItem): string {
  return generateStableId({ guid: item.guid, link: item.link, title: item.title });
}

async function sendDealEmbed(
  client: Client,
  item: DealItem,
  platform: PlatformConfig,
): Promise<void> {
  if (!platform.channelId) {
    logger.warn(`[DealsCron] Salon non configure pour ${platform.name}`);
    return;
  }

  try {
    const channel = await client.channels.fetch(platform.channelId);
    if (!channel?.isTextBased()) {
      logger.warn(`[DealsCron] Channel ${platform.channelId} non disponible pour ${platform.name}`);
      return;
    }

    // Nettoyer le HTML de la description avant traduction
    const cleanHtmlContent = (item.contentSnippet || item.content || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    // Traduire le titre si nécessaire
    let translatedTitle = item.title;
    let translatedDescription = cleanHtmlContent;

    try {
      const titleResult = await translateAutoToFrench(item.title);
      if (titleResult && titleResult.detectedLanguage !== "fr") {
        translatedTitle = titleResult.translatedText;
      }

      const descResult = await translateAutoToFrench(cleanHtmlContent);
      if (descResult && descResult.detectedLanguage !== "fr") {
        translatedDescription = descResult.translatedText;
      }
    } catch (error) {
      logger.debug(
        `[DealsCron] Erreur traduction, utilisation texte original: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const finalDescription = translatedDescription.substring(0, 1000);

    // Extract image from item, fallback to OG image from the page, then platform default
    let imageUrl = item.thumbnail || item.enclosure?.url || null;

    // Si pas d'image dans le RSS, scraper l'Open Graph de la page du deal
    if (!imageUrl) {
      try {
        const ogImage = await getOgImage(item.link);
        if (ogImage) imageUrl = ogImage;
      } catch {
        // Ignore OG fetch errors
      }
    }

    // Fallback final: image par défaut de la plateforme
    if (!imageUrl) {
      imageUrl = platform.defaultImage;
    }

    const embed = new EmbedBuilder()
      .setTitle(translatedTitle)
      .setDescription(finalDescription || "Aucune description disponible")
      .setColor(platform.color)
      .setURL(item.link)
      .addFields(
        { name: "Plateforme", value: platform.name, inline: true },
        { name: "Publie le", value: new Date(item.pubDate).toLocaleString("fr-FR"), inline: true },
      )
      .setTimestamp()
      .setFooter({ text: "🎮 Surveillance des offres • " + platform.name });

    // Optimiser l'image avec Sharp si c'est une URL d'image valide
    let sendOptions: { embeds: EmbedBuilder[]; files?: AttachmentBuilder[] } = { embeds: [embed] };
    if (imageUrl && isOptimizableImageUrl(imageUrl) && imageUrl !== platform.defaultImage) {
      try {
        const optimized = await fetchAndOptimizeImage(imageUrl);
        if (optimized) {
          const attachment = new AttachmentBuilder(optimized.buffer, { name: "deal.jpg" });
          embed.setImage("attachment://deal.jpg");
          sendOptions = { embeds: [embed], files: [attachment] };
        } else {
          embed.setImage(imageUrl);
        }
      } catch {
        embed.setImage(imageUrl);
      }
    } else {
      embed.setImage(imageUrl);
    }

    await (channel as TextChannel).send(sendOptions);
    logger.info(`[DealsCron] Deal envoye dans ${platform.name}: ${translatedTitle}`);
  } catch (error) {
    logger.error(
      `[DealsCron] Erreur envoi deal ${platform.name}: ${error instanceof Error ? error.message : String(error)}`,
      { stack: error instanceof Error ? error.stack : undefined },
    );
  }
}
async function processDealItem(client: Client, item: DealItem): Promise<void> {
  // ⏱️ Barrière temporelle 48h : ignorer les articles trop anciens (évite le re-post massif après reset BDD)
  const articleDate = new Date(item.pubDate);
  const limitDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (isNaN(articleDate.getTime()) || articleDate < limitDate) {
    return;
  }
  try {
    // Validate RSS item
    if (!validateRssItem(item as unknown as Record<string, unknown>)) {
      logger.warn(`[DealsCron] Item RSS invalide ignore: ${item.title || "sans titre"}`);
      return;
    }

    // Sanitize title
    const sanitizedTitle = sanitizeString(item.title);
    if (!sanitizedTitle) {
      logger.warn(`[DealsCron] Titre vide apres sanitization: ${item.title}`);
      return;
    }

    const guid = generateDealGuid(item);

    if (await isDealProcessed(guid)) {
      logger.debug(`[DealsCron] Deal deja traite: ${sanitizedTitle}`);
      return;
    }

    // VERROU ANTI-SPAM : dedup cache JSON local
    if (dedupCache.isAlreadyProcessed("deals", guid)) {
      logger.debug(`[SPAM BLOQUE] Deals doublon cache: ${guid}`);
      return;
    }

    const platforms = detectPlatforms(sanitizedTitle);

    if (platforms.length === 0) {
      logger.warn(`[DealsCron] Plateforme non detectee pour: ${sanitizedTitle}`);
      const defaultPlatform = PLATFORM_CONFIGS[0];
      if (defaultPlatform.channelId) {
        await sendDealEmbed(client, item, defaultPlatform);
      }
      // Marquer dans le cache JSON anti-doublon
      await dedupCache.markAsProcessed("deals", guid);
      await markDealProcessed(guid);
      return;
    }

    // Send to all detected platforms (multi-platform routing)
    for (const platform of platforms) {
      if (!platform.channelId) {
        logger.warn(
          `[DealsCron] Salon non configure pour ${platform.name}, deal ignore: ${item.title}`,
        );
        continue;
      }
      await sendDealEmbed(client, item, platform);
      // 🔒 Delai anti rate-limit Discord (1s entre chaque envoi)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await markDealProcessed(guid);
  } catch (error) {
    logger.error(
      `[DealsCron] Erreur traitement deal "${item.title}": ${error instanceof Error ? error.message : String(error)}`,
      { stack: error instanceof Error ? error.stack : undefined },
    );
  }
}

async function checkDeals(client: Client): Promise<void> {
  // 🔒 Recharge le cache anti-doublon depuis le disque (persistance inter-cycles)
  await dedupCache.reloadFromDisk();
  const startTime = Date.now();
  const jobName = "dealsCron";

  // Securite anti-crash : verification stricte des variables d'environnement
  const hasAnyChannel = PLATFORM_CONFIGS.some((p) => p.channelId);
  if (!hasAnyChannel) {
    logger.warn(
      "[DealsCron] Aucun CHANNEL_ID configure (STEAM_EPIC_CHANNEL_ID, PLAYSTATION_CHANNEL_ID, XBOX_CHANNEL_ID, NINTENDO_CHANNEL_ID) — cron desactive",
    );
    metricsCollector.recordProcessing(jobName, false, Date.now() - startTime);
    return;
  }

  logger.info("[DealsCron] Verification des flux RSS pour les nouveaux deals...");

  try {
    for (const feedUrl of RSS_FEEDS) {
      try {
        logger.debug(`[DealsCron] Analyse du flux: ${feedUrl}`);

        // Fetch via rss2json API (JSON direct, pas besoin de parser XML) with retry logic
        const response = await retry(() => axios.get(feedUrl, { timeout: 10000 }), 3, 1000);

        const feed = response.data;
        const items = feed.items || [];

        if (!items || items.length === 0) {
          logger.debug(`[DealsCron] Aucun item trouve dans: ${feedUrl}`);
          continue;
        }

        const recentItems = items.slice(0, 10) as DealItem[];

        // Process items in parallel for better performance
        await Promise.all(recentItems.map((item) => processDealItem(client, item)));

        logger.info(`[DealsCron] ${recentItems.length} item(s) traite(s) depuis ${feedUrl}`);
      } catch (error) {
        logger.error(
          `[DealsCron] Erreur analyse du flux ${feedUrl}: ${error instanceof Error ? error.message : String(error)}`,
          { stack: error instanceof Error ? error.stack : undefined },
        );
      }
    }

    metricsCollector.recordProcessing(jobName, true, Date.now() - startTime);
  } catch (error) {
    logger.error(
      `[DealsCron] Erreur globale du cron: ${error instanceof Error ? error.message : String(error)}`,
      { stack: error instanceof Error ? error.stack : undefined },
    );
    metricsCollector.recordProcessing(jobName, false, Date.now() - startTime);
  }
}

export function startDealsMonitoring(client: Client): void {
  if (dealsCronJob) {
    logger.warn("[DealsCron] Surveillance deja active");
    return;
  }

  // Securite anti-crash : garde au demarrage
  const hasAnyChannel = PLATFORM_CONFIGS.some((p) => p.channelId);
  if (!hasAnyChannel) {
    logger.warn("[DealsCron] Aucun CHANNEL_ID configure — surveillance desactivee");
    return;
  }

  logger.info("[DealsCron] Demarrage de la surveillance des deals (toutes les 30 minutes)");

  checkDeals(client).catch((err) =>
    logger.error(
      `[DealsCron] Erreur check initial: ${err instanceof Error ? err.message : String(err)}`,
      { stack: err instanceof Error ? err.stack : undefined },
    ),
  );

  dealsCronJob = cron.schedule("*/30 * * * *", () => {
    checkDeals(client).catch((err) =>
      logger.error(
        `[DealsCron] Erreur check periodique: ${err instanceof Error ? err.message : String(err)}`,
        { stack: err instanceof Error ? err.stack : undefined },
      ),
    );
  });
}

export function stopDealsMonitoring(): void {
  if (dealsCronJob) {
    dealsCronJob.stop();
    dealsCronJob = null;
    logger.info("[DealsCron] Surveillance arretee");
  }
}

export { checkDeals, detectPlatforms, PLATFORM_CONFIGS };
