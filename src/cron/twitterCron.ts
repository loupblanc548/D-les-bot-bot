import {
  Client,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import prisma from "../prisma.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import { translateToFrench, isLikelyEnglish } from "../utils/translator.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { getTweetImage } from "../utils/image-helpers.js";
import { pushFortniteDetection } from "../services/fortnite-broadcast.js";

// Constantes

const TWITTER_BLUE = 0x1da1f2;
const RSSHUB_BASE = "https://rsshub.app/twitter/user";
const MAX_TWEETS_PER_ACCOUNT = 3;

const FOOTER = { text: "Twitter Monitor • Surveillance automatique" };
const TWITTER_ICON = "https://abs.twimg.com/responsive-web/client-web/icon-default.522d363a.png";

const rssParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

// Types

interface TweetData {
  tweetId: string;
  account: string;
  content: string;
  pubDate: string;
  link: string;
  imageUrl: string | null;
}

type Platform =
  | "epic"
  | "steam"
  | "playstation"
  | "xbox"
  | "nintendo"
  | "fortnite"
  | "instantgaming";

interface PlatformConfig {
  id: Platform;
  channelId: string | undefined;
  color: number;
  label: string;
  iconUrl: string;
}

// Configuration des plateformes (routage multi-console pour tweets gaming)
const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    id: "epic",
    channelId: config.steamEpicChannel,
    color: 0x2a2a2a,
    label: "Epic Games",
    iconUrl: "https://store.epicgames.com/favicon.ico",
  },
  {
    id: "steam",
    channelId: config.steamEpicChannel,
    color: 0x000080,
    label: "Steam",
    iconUrl: "https://store.steampowered.com/favicon.ico",
  },
  {
    id: "playstation",
    channelId: config.playstationChannel,
    color: 0x003791,
    label: "PlayStation",
    iconUrl: "https://www.playstation.com/favicon.ico",
  },
  {
    id: "xbox",
    channelId: config.xboxChannel,
    color: 0x107c10,
    label: "Xbox",
    iconUrl: "https://www.xbox.com/favicon.ico",
  },
  {
    id: "nintendo",
    channelId: config.nintendoChannel,
    color: 0xe60012,
    label: "Nintendo",
    iconUrl: "https://www.nintendo.com/favicon.ico",
  },
  {
    id: "fortnite",
    channelId: config.fortniteChannel,
    color: 0x9147ff,
    label: "Fortnite",
    iconUrl: "https://static-assets-prod.epicgames.com/fortnite/favicon.ico",
  },
  {
    id: "instantgaming",
    channelId: config.instantGamingChannel,
    color: 0xcd7f32,
    label: "Instant Gaming",
    iconUrl: "https://www.instant-gaming.com/favicon.ico",
  },
];

// Etat interne

let cronJob: ScheduledTask | null = null;
let isChecking = false;
let checkCount = 0;

// Helpers

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageFromHtml(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function isValidUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function extractTweetId(link: string): string | null {
  const match = link.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

// Fetch RSS

async function fetchTweetsForAccount(account: string): Promise<TweetData[]> {
  const url = RSSHUB_BASE + "/" + account;
  const tweets: TweetData[] = [];

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const parsed = rssParser.parse(response.data);
    const items = parsed?.rss?.channel?.item;
    if (!items) return [];

    const itemList = (Array.isArray(items) ? items : [items]).slice(0, MAX_TWEETS_PER_ACCOUNT);

    for (const item of itemList) {
      const title = stripHtml(item.title || "");
      const link = item.link || "";
      const pubDate = item.pubDate || "";
      const tweetId = extractTweetId(link);

      if (!tweetId || !title) continue;

      let content = "";
      if (item.description) {
        content = stripHtml(item.description);
      }

      let imageUrl: string | null = null;

      const enclosureUrl = item.enclosure?.["@_url"] ?? item.enclosure?.url ?? null;
      if (isValidUrl(enclosureUrl)) imageUrl = enclosureUrl;

      if (!imageUrl && item["media:content"]) {
        const mc = item["media:content"];
        const mcFirst = Array.isArray(mc) ? mc[0] : mc;
        const mcUrl = mcFirst?.["@_url"] ?? mcFirst?.url ?? null;
        if (isValidUrl(mcUrl)) imageUrl = mcUrl;
      }

      if (!imageUrl && item.description) {
        const img = extractImageFromHtml(item.description);
        if (isValidUrl(img)) imageUrl = img;
      }

      tweets.push({
        tweetId,
        account,
        content,
        pubDate,
        link,
        imageUrl,
      });
    }
  } catch (error) {
    logger.warn(
      "[TwitterCron] Flux RSS inaccessible pour @" +
        account +
        ": " +
        (error instanceof Error ? error.message : String(error)),
    );
  }

  return tweets;
}

// Detection de plateforme dans le contenu du tweet
function detectPlatforms(text: string): PlatformConfig[] {
  const t = text.toLowerCase();
  const matched: PlatformConfig[] = [];
  const seen = new Set<Platform>();

  if (/\b(epic games|epic)\b/.test(t) && !seen.has("epic")) {
    matched.push(PLATFORM_CONFIGS.find((p) => p.id === "epic")!);
    seen.add("epic");
  }
  if (/\b(steam)\b/.test(t) && !seen.has("steam")) {
    matched.push(PLATFORM_CONFIGS.find((p) => p.id === "steam")!);
    seen.add("steam");
  }
  if (/\b(playstation|ps4|ps5|psn)\b/.test(t) && !seen.has("playstation")) {
    matched.push(PLATFORM_CONFIGS.find((p) => p.id === "playstation")!);
    seen.add("playstation");
  }
  if (/\b(xbox|xbl|microsoft|series\s*[xs])\b/.test(t) && !seen.has("xbox")) {
    matched.push(PLATFORM_CONFIGS.find((p) => p.id === "xbox")!);
    seen.add("xbox");
  }
  if (/\b(nintendo|switch)\b/.test(t) && !seen.has("nintendo")) {
    matched.push(PLATFORM_CONFIGS.find((p) => p.id === "nintendo")!);
    seen.add("nintendo");
  }

  if (/\b(fortnite|\bfn\b|battle\s*royale)\b/.test(t) && !seen.has("fortnite")) {
    matched.push(PLATFORM_CONFIGS.find((p) => p.id === "fortnite")!);
    seen.add("fortnite");
  }
  if (/\b(instant\s*gaming)\b/.test(t) && !seen.has("instantgaming")) {
    matched.push(PLATFORM_CONFIGS.find((p) => p.id === "instantgaming")!);
    seen.add("instantgaming");
  }
  return matched;
}

// Fonction principale

async function checkTwitterAccounts(client: Client): Promise<void> {
  // 🔒 Recharge le cache anti-doublon depuis le disque (persistance inter-cycles)
  await dedupCache.reloadFromDisk();
  // Securite anti-crash : verifier qu'au moins un salon est configure
  const hasAnyChannel =
    config.twitterChannel ||
    config.steamEpicChannel ||
    config.playstationChannel ||
    config.xboxChannel ||
    config.nintendoChannel ||
    config.fortniteChannel ||
    config.instantGamingChannel;
  if (!hasAnyChannel) {
    logger.warn(
      "[TwitterCron] Aucun CHANNEL_ID configure (TWITTER_CHANNEL_ID, STEAM_EPIC_CHANNEL_ID, PLAYSTATION_CHANNEL_ID, XBOX_CHANNEL_ID, NINTENDO_CHANNEL_ID, FORTNITE_CHANNEL_ID, INSTANT_GAMING_CHANNEL_ID) — cron desactive",
    );
    return;
  }

  const accountsRaw = config.twitterAccounts;
  // Fusionner avec les comptes des routes spécifiques par plateforme
  const platformRouting = config.twitterPlatformRouting;
  const allPlatformAccounts = platformRouting.flatMap((r) => r.accounts);
  const globalAccounts = (accountsRaw || "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  // Combiner en dédupliquant
  const accounts = [...new Set([...globalAccounts, ...allPlatformAccounts])];

  if (accounts.length === 0) {
    logger.warn("[TwitterCron] Aucun compte Twitter configuré");
    return;
  }

  // Map: account → channelId (pour routing par compte)
  const accountToChannel = new Map<string, string>();
  for (const route of platformRouting) {
    for (const acc of route.accounts) {
      accountToChannel.set(acc.toLowerCase(), route.channelId);
    }
  }

  if (isChecking) {
    logger.info("[TwitterCron] Vérification déjà en cours, ignorée");
    return;
  }

  isChecking = true;
  const startTime = Date.now();
  let tweetsSent = 0;

  try {
    checkCount++;
    logger.info(
      "[TwitterCron] Verification #" + checkCount + " de " + accounts.length + " compte(s)...",
    );

    const results = await Promise.allSettled(
      accounts.map(async (account) => fetchTweetsForAccount(account)),
    );

    const allTweets: TweetData[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allTweets.push(...result.value);
      }
    }

    if (allTweets.length === 0) {
      logger.info("[TwitterCron] Aucun tweet trouve");
      return;
    }

    // Deduplication via ProcessedTweets (SQLite)
    const freshTweets: TweetData[] = [];
    for (const tweet of allTweets) {
      const existing = await prisma.processedTweets.findUnique({
        where: { tweetId: tweet.tweetId },
      });
      if (!existing) {
        freshTweets.push(tweet);
      }
    }

    if (freshTweets.length === 0) {
      logger.info("[TwitterCron] Tous les tweets sont déjà connus");
      return;
    }

    logger.info("[TwitterCron] " + freshTweets.length + " nouveau(x) tweet(s) à publier");

    // VERROU ANTI-SPAM : dedup cache JSON local (barriere absolue)
    for (const tweet of freshTweets) {
      // Dedup cache check on tweetId
      if (dedupCache.isAlreadyProcessed("twitter", tweet.tweetId)) {
        logger.debug("[SPAM BLOQUE] Twitter doublon cache: " + tweet.tweetId);
        continue;
      }
      // 🔒 Barriere temporelle 24h (anti-spam strict)
      const articleDate = new Date(tweet.pubDate);
      const limitDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (isNaN(articleDate.getTime()) || articleDate < limitDate) continue;

      const platforms = detectPlatforms(tweet.content);

      // 1. Routing par compte (account → channel) — priorité
      const accountChannel = accountToChannel.get(tweet.account.toLowerCase());

      // 2. Fallback : détection par mots-clés dans le contenu
      // 3. Fallback final : TWITTER_CHANNEL_ID
      const targetConfigs: PlatformConfig[] = accountChannel
        ? [
            {
              id: "steam" as Platform,
              channelId: accountChannel,
              color: TWITTER_BLUE,
              label: "Twitter",
              iconUrl: TWITTER_ICON,
            },
          ]
        : platforms.length > 0
          ? platforms
          : [
              {
                id: "steam" as Platform,
                channelId: config.twitterChannel,
                color: TWITTER_BLUE,
                label: "Twitter",
                iconUrl: TWITTER_ICON,
              },
            ];

      // Deduplication des salons (Steam+Epic partagent le meme channel)
      const seenChannels = new Set<string>();

      for (const cfg of targetConfigs) {
        if (!cfg.channelId || seenChannels.has(cfg.channelId)) continue;
        seenChannels.add(cfg.channelId);

        let channel: TextChannel | null = null;
        try {
          const fetched = await client.channels.fetch(cfg.channelId);
          if (fetched?.isTextBased()) channel = fetched as TextChannel;
        } catch {
          /* ignore */
        }
        if (!channel) {
          logger.warn("[TwitterCron] Salon " + cfg.channelId + " indisponible pour " + cfg.label);
          continue;
        }

        const embedColor = cfg.id === "epic" && !platforms.length ? TWITTER_BLUE : cfg.color;

        // Traduire le contenu du tweet si nécessaire
        let translatedContent = tweet.content.slice(0, 2048) || "Contenu du tweet indisponible";
        try {
          if (isLikelyEnglish(tweet.content)) {
            translatedContent = await translateToFrench(tweet.content.slice(0, 2048));
          }
        } catch (error) {
          logger.debug(
            `[TwitterCron] Erreur traduction, utilisation texte original: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        const embed = new EmbedBuilder()
          .setTitle("\uD83D\uDD25 Nouveau Tweet de @" + tweet.account)
          .setURL(tweet.link)
          .setColor(embedColor)
          .setAuthor({
            name: "@" + tweet.account,
            iconURL: TWITTER_ICON,
            url: "https://x.com/" + tweet.account,
          })
          .setDescription(translatedContent)
          .addFields({ name: "\uD83D\uDDA5\uFE0F Plateforme", value: cfg.label, inline: true })
          .setFooter(FOOTER)
          .setTimestamp();

        if (tweet.pubDate) {
          embed.addFields({
            name: "\uD83D\uDCC5 Publi\u00E9 le",
            value: tweet.pubDate,
            inline: true,
          });
        }

        if (tweet.imageUrl) {
          embed.setImage(tweet.imageUrl);
        } else {
          // Fallback: scraper l'image du tweet sur xcancel
          try {
            const tweetImg = await getTweetImage(tweet.link);
            if (tweetImg) embed.setImage(tweetImg);
          } catch {
            // Ignore image fetch errors
          }
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("\uD83D\uDD17 Ouvrir sur X")
            .setStyle(ButtonStyle.Link)
            .setURL(tweet.link),
        );

        try {
          await channel.send({
            content: "\uD83D\uDD14 **Nouveau tweet de @" + tweet.account + "**",
            embeds: [embed],
            components: [row],
          });
          logger.info("[TwitterCron] \u2713 " + cfg.label + " : @" + tweet.account);
          if (cfg.id === "fortnite") {
            pushFortniteDetection(
              "tweets",
              `Tweet Fortnite: ${tweet.content?.slice(0, 100) || "(media)"}`,
            );
          }
        } catch (sendError) {
          const sendMsg = sendError instanceof Error ? sendError.message : String(sendError);
          logger.error("[TwitterCron] \u2717 Echec envoi " + cfg.label + ": " + sendMsg);
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Marquer dans le cache JSON anti-doublon
      await dedupCache.markAsProcessed("twitter", tweet.tweetId);

      await prisma.processedTweets.create({
        data: {
          tweetId: tweet.tweetId,
          account: tweet.account,
          content: tweet.content.slice(0, 500),
        },
      });
      tweetsSent++;
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      "[TwitterCron] ✓ " +
        tweetsSent +
        " tweet(s) envoyé(s) en " +
        (elapsed / 1000).toFixed(1) +
        "s",
    );
  } catch (error) {
    logger.error(
      "[TwitterCron] Erreur critique: " + (error instanceof Error ? error.message : String(error)),
      { stack: error instanceof Error ? error.stack : undefined },
    );
  } finally {
    isChecking = false;
  }
}

// Demarrage / Arret

export function startTwitterMonitoring(client: Client): void {
  if (cronJob) {
    logger.warn("[TwitterCron] Déjà actif — ignoré");
    return;
  }

  if (!config.twitterAccounts || config.twitterAccounts.length === 0) {
    logger.warn("[TwitterCron] TWITTER_ACCOUNTS non configuré — surveillance désactivée");
    return;
  }

  const hasAnyChannel =
    config.twitterChannel ||
    config.steamEpicChannel ||
    config.playstationChannel ||
    config.xboxChannel ||
    config.nintendoChannel ||
    config.fortniteChannel ||
    config.instantGamingChannel;
  if (!hasAnyChannel) {
    logger.warn("[TwitterCron] Aucun CHANNEL_ID configuré — surveillance désactivée");
    return;
  }

  logger.info("[TwitterCron] ⏱️ Exécution Cron planifiée pour Twitter — toutes les 15 minutes");

  cronJob = cron.schedule("*/15 * * * *", () => {
    logger.info("[TwitterCron] ⏱️ Exécution Cron planifiée pour Twitter");
    checkTwitterAccounts(client).catch((err) =>
      logger.error(
        "[TwitterCron] Erreur cron: " + (err instanceof Error ? err.message : String(err)),
        { stack: err instanceof Error ? err.stack : undefined },
      ),
    );
  });
}

export function stopTwitterMonitoring(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[TwitterCron] Arrêté");
  }
}

export { checkTwitterAccounts, fetchTweetsForAccount, extractTweetId };
