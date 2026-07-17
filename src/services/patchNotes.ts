import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { EmbedBuilder, TextChannel, Client } from "discord.js";
import { XMLParser } from "fast-xml-parser";
import { getOpenAIClient } from "./ai.js";
import { getOgImage, isValidEmbedImageUrl } from "../utils/image-helpers.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { PLATFORM_LABELS, PLATFORM_COLORS } from "./feeds.js";

interface PatchNote {
  game: string;
  title: string;
  url: string;
  rawContent: string;
}

const RSS_FEEDS: { game: string; url: string; channelId: string }[] = [];

function initFeeds() {
  if (config.fortniteChannel)
    RSS_FEEDS.push({
      game: "Fortnite",
      url: "https://www.fortnite.com/news/rss",
      channelId: config.fortniteChannel,
    });
  if (config.dedicatedChannel)
    RSS_FEEDS.push({
      game: "Helldivers 2",
      url: "steam:553850",
      channelId: config.dedicatedChannel,
    });
  if (config.dedicatedChannel)
    RSS_FEEDS.push({
      game: "Call of Duty Warzone",
      url: "https://store.steampowered.com/feeds/news/app/1933590/",
      channelId: config.dedicatedChannel,
    });
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

// Circuit breaker: skip feeds that fail repeatedly
const feedFailures = new Map<string, { count: number; skipUntil: number }>();
const MAX_FAILURES = 3;
const SKIP_DURATION_MS = 30 * 60 * 1000; // 30 min

// Extrait le texte d'un champ XML : string simple ou objet { #text: "..." }
function textOf(val: any): string {
  return typeof val === "string" ? val : val?.["#text"] || "";
}

async function fetchPatchNotes(feed: { game: string; url: string }): Promise<PatchNote | null> {
  try {
    // Steam Web API fallback for steam:appid URLs
    if (feed.url.startsWith("steam:")) {
      const appid = feed.url.split(":")[1];
      const steamKey = process.env.STEAM_WEB_API_KEY;
      const steamUrl = steamKey
        ? `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appid}&count=1&maxlength=3000&format=json&key=${steamKey}`
        : `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appid}&count=1&maxlength=3000&format=json`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(steamUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" },
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data = await response.json() as any;
      const newsItem = data?.appnews?.newsitems?.[0];
      if (!newsItem) return null;
      const title = newsItem.title || `${feed.game} Update`;
      const rawContent = (newsItem.contents || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
      const url = newsItem.url || `https://store.steampowered.com/news/app/${appid}`;
      if (!rawContent) return null;
      return { game: feed.game, title, url, rawContent };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0; PatchNotes)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const xml = await response.text();
    const parsed = xmlParser.parse(xml);

    // Support RSS 2.0 et Atom
    let firstItem: Record<string, unknown> | null = null;
    if (parsed.rss?.channel?.item) {
      firstItem = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item[0]
        : parsed.rss.channel.item;
    }
    if (!firstItem && parsed.feed?.entry) {
      firstItem = Array.isArray(parsed.feed.entry) ? parsed.feed.entry[0] : parsed.feed.entry;
    }
    if (!firstItem) return null;

    const title = textOf(firstItem.title).trim() || feed.game + " Update";
    const rawContent = (
      textOf(firstItem.description) ||
      textOf(firstItem.summary) ||
      textOf(firstItem.content) ||
      textOf(firstItem["content:encoded"]) ||
      ""
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);

    let url = "";
    if (typeof firstItem.link === "string") {
      url = firstItem.link;
    } else if ((firstItem.link as any)?.["@_href"]) {
      url = (firstItem.link as any)["@_href"];
    } else if ((firstItem.link as any)?.["#text"]) {
      url = (firstItem.link as any)["#text"];
    }
    url = url.trim();

    if (!rawContent) return null;
    return { game: feed.game, title, url, rawContent };
  } catch (err) {
    logger.error(
      `[PatchNotes] Erreur fetch ${feed.game}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function summarizeWithAI(rawContent: string): Promise<string> {
  // Plan A: Ollama local (GPU, gratuit)
  try {
    const { ollamaSummarize } = await import("../utils/ollama.js");
    const summary = await ollamaSummarize(rawContent, 5);
    if (summary && summary.trim().length > 0) return summary;
  } catch {
    // Ollama indisponible — fallback OpenRouter
  }

  // Plan B: OpenRouter API
  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant gaming d elite. Prends ce patch note brut et resume-le sous forme de 5 points cles indispensables pour les joueurs. Style direct, punchy, sans fioritures. Reponds en francais.",
        },
        { role: "user", content: rawContent },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content || "Resume indisponible.";
  } catch {
    return "Resume indisponible (erreur IA).";
  }
}

let patchCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startPatchNotesService(client: Client) {
  initFeeds();
  if (RSS_FEEDS.length === 0) {
    logger.info("[PatchNotes] Aucun flux RSS configure");
    return;
  }
  logger.info("[PatchNotes] Surveillance de " + RSS_FEEDS.length + " flux RSS");
  patchCheckInterval = safeInterval(
    "PatchNotes",
    () => checkAllFeeds(client),
    config.patchNotesIntervalMs,
  );
  checkAllFeeds(client);
}

export function stopPatchNotesService() {
  if (patchCheckInterval) {
    clearInterval(patchCheckInterval);
    patchCheckInterval = null;
  }
}

async function checkAllFeeds(client: Client) {
  for (const feed of RSS_FEEDS) {
    // Circuit breaker: skip feeds in cooldown
    const failure = feedFailures.get(feed.game);
    if (failure && Date.now() < failure.skipUntil) {
      continue;
    }

    try {
      const patchNote = await fetchPatchNotes(feed);
      if (!patchNote) {
        // Track failures for circuit breaker
        const f = feedFailures.get(feed.game) || { count: 0, skipUntil: 0 };
        f.count++;
        if (f.count >= MAX_FAILURES) {
          f.skipUntil = Date.now() + SKIP_DURATION_MS;
          f.count = 0;
          logger.warn(`[PatchNotes] Flux ${feed.game} désactivé 30min (${MAX_FAILURES} échecs consécutifs)`);
        }
        feedFailures.set(feed.game, f);
        continue;
      }
      // Reset failures on success
      feedFailures.delete(feed.game);
      const alreadyNotified = await prisma.notification.findFirst({
        where: { sourceId: "patch-" + feed.game, content: patchNote.title },
      });
      if (alreadyNotified) continue;
      const summary = await summarizeWithAI(patchNote.rawContent);
      const lines = summary
        .split(/\n\s*\n|\n(?=\d+\.|-|\*)/)
        .filter(Boolean)
        .slice(0, 5);
      const embed = new EmbedBuilder()
        .setTitle(PLATFORM_LABELS["patch_notes"] + " — " + feed.game)
        .setColor(PLATFORM_COLORS["patch_notes"])
        .setDescription(
          lines.map((p, i) => "**" + (i + 1) + ".** " + p.trim()).join("\n") || summary,
        )
        .setFooter({
          text: "Resume genere automatiquement par IA • " + new Date().toLocaleDateString("fr-FR"),
        })
        .setTimestamp();
      if (patchNote.url) embed.setURL(patchNote.url);
      // Ajout automatique d'image de l'article (og:image)
      try {
        if (patchNote.url) {
          const ogImage = await getOgImage(patchNote.url);
          if (ogImage && isValidEmbedImageUrl(ogImage)) embed.setImage(ogImage);
        }
      } catch {}
      try {
        const channel = await client.channels.fetch(feed.channelId);
        if (channel?.isTextBased()) {
          await (channel as TextChannel).send({ embeds: [embed] });
          await prisma.notification.upsert({
            where: { url: patchNote.url },
            update: {},
            create: {
              sourceId: "patch-" + feed.game,
              platform: "patch_notes",
              content: patchNote.title,
              url: patchNote.url,
            },
          });
        }
      } catch (err) {
        logger.error(
          "[PatchNotes] Erreur envoi Discord:",
          err instanceof Error ? err.message : String(err),
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("403") || errMsg.includes("empty") || errMsg.includes("null") || errMsg === "") {
        logger.debug(`[PatchNotes] Flux ${feed.game} indisponible: ${errMsg}`);
      } else {
        logger.error(
          `[PatchNotes] Erreur flux ${feed.game}:`,
          errMsg,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }
  }
}
