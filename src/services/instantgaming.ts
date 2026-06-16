import logger from "../utils/logger";
import axios from "axios";
import * as cheerio from "cheerio";
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

const GIVEAWAY_BASE = config.instantGamingBaseUrl;
const GIVEAWAY_URL = GIVEAWAY_BASE + "/fr/giveaway/INSTANTGAMING";
const IG_ORANGE = 0xef7f1a;

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

interface GiveawayData {
  id: string;
  title: string;
  image: string | null;
  url: string;
}

function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function resolveUrl(href: string | undefined, base: string): string {
  if (!href) return base;
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return GIVEAWAY_BASE + href;
  return base + "/" + href;
}

async function scrapeGiveawayPage(): Promise<GiveawayData | null> {
  try {
    const response = await axios.get(GIVEAWAY_URL, {
      headers: HEADERS,
      timeout: 15000,
      maxRedirects: 5,
    });

    const html: string = response.data;
    const $ = cheerio.load(html);

    let title =
      $('[class*="giveaway"] h2').first().text() ||
      $('[class*="giveaway"] h3').first().text() ||
      $('.giveaway-container h2').first().text() ||
      $('.giveaway-container h3').first().text() ||
      $('[class*="prize"]').first().text() ||
      $('meta[property="og:title"]').attr("content") ||
      $("h1").first().text() ||
      $("title").text() ||
      "";

    if (!title) {
      logger.warn("[InstantGaming] Impossible d'extraire le titre.");
      return null;
    }

    title = cleanTitle(title);

    const image =
      $('meta[property="og:image"]').attr("content") ||
      $('.giveaway-container img').first().attr("src") ||
      $('[class*="giveaway"] img').first().attr("src") ||
      null;

    const resolvedImage = image ? resolveUrl(image, GIVEAWAY_URL) : null;

    const pageUrl =
      $('meta[property="og:url"]').attr("content") ||
      $('link[rel="canonical"]').attr("href") ||
      GIVEAWAY_URL;

    const slugMatch = pageUrl.match(/\/giveaway\/([^/?#]+)/i);
    const slug = slugMatch ? slugMatch[1].toUpperCase() : "INSTANTGAMING";

    return {
      id: slug,
      title,
      image: resolvedImage,
      url: pageUrl,
    };
  } catch (error) {
    logger.error(
      "[InstantGaming] Erreur lors du scraping:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

async function sendGiveawayEmbed(
  client: Client,
  data: GiveawayData
): Promise<void> {
  const channelId = config.instantGamingChannel;
  if (!channelId) {
    logger.warn("[InstantGaming] INSTANT_GAMING_CHANNEL_ID non configure.");
    return;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    logger.warn("[InstantGaming] Salon introuvable ou non textuel.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎁 NOUVEAU CONCOURS INSTANT GAMING !")
    .setDescription(
      "## **" + data.title + "**\n\n" +
      "🔗 [Voir le concours](" + data.url + ")\n\n" +
      "📅 *Participez avant la fin du tirage au sort !*"
    )
    .setColor(IG_ORANGE)
    .setFooter({
      text: "Instant Gaming • Concours",
      iconURL: GIVEAWAY_BASE + "/themes/igv2/images/favicon.png",
    })
    .setTimestamp();

  if (data.image) {
    embed.setImage(data.image);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("🎮 Participer")
      .setStyle(ButtonStyle.Link)
      .setURL(data.url)
  );

  await (channel as TextChannel).send({
    embeds: [embed],
    components: [row],
  });

  logger.info("[InstantGaming] Notification envoyee : " + data.title);
}

let isChecking = false;

export async function checkInstantGamingGiveaway(
  client: Client
): Promise<void> {
  if (isChecking) return;
  isChecking = true;

  try {
    logger.info("[InstantGaming] Verification des concours...");

    const data = await scrapeGiveawayPage();
    if (!data) {
      logger.info("[InstantGaming] Aucune donnee extraite.");
      return;
    }

    let inserted = false;
    try {
      await prisma.igGiveaway.upsert({
        where: { id: data.id },
        update: {},
        create: {
          id: data.id,
          title: data.title,
        },
      });
      inserted = true;
      logger.info("[InstantGaming] Nouveau concours detecte : " + data.title);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`[InstantGaming] Erreur DB: ${err.message}`, { stack: err.stack });
      await sendErrorLog("InstantGaming DB", err, client);
      return;
    }

    if (inserted) {
      try {
        await sendGiveawayEmbed(client, data);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("[InstantGaming] Erreur d'envoi:", err.message);
        await sendErrorLog("InstantGaming sendGiveawayEmbed", err, client);
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("[InstantGaming] Erreur globale:", err.message);
    await sendErrorLog("InstantGaming check", err, client);
  } finally {
    isChecking = false;
  }
}

const CHECK_INTERVAL_MS = config.igGiveawayIntervalMs;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startInstantGamingCheck(client: Client): void {
  if (intervalId) {
    logger.warn("[InstantGaming] Surveillance deja active.");
    return;
  }

  logger.info("[InstantGaming] Surveillance activee (intervalle: 12h)");

  checkInstantGamingGiveaway(client).catch((err) =>
    logger.error("[InstantGaming] Erreur check initial:", err)
  );

  intervalId = setInterval(() => {
    checkInstantGamingGiveaway(client).catch((err) =>
      logger.error("[InstantGaming] Erreur check cyclique:", err)
    );
  }, CHECK_INTERVAL_MS);
}

export function stopInstantGamingCheck(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("[InstantGaming] Surveillance arretee.");
  }
}
