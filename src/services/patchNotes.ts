import logger from "../utils/logger.js";
import { EmbedBuilder, TextChannel, Client } from "discord.js";
import { XMLParser } from "fast-xml-parser";
import { getOpenAIClient } from "./ai.js";
import { getOgImage } from "../utils/image-helpers.js";
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
  if (config.fortniteChannel) RSS_FEEDS.push({ game: "Fortnite", url: "https://www.fortnite.com/news/rss", channelId: config.fortniteChannel });
  if (config.dedicatedChannel) RSS_FEEDS.push({ game: "Helldivers 2", url: "https://store.steampowered.com/feeds/news/app/553850/?l=french", channelId: config.dedicatedChannel });
  if (config.dedicatedChannel) RSS_FEEDS.push({ game: "Call of Duty Warzone", url: "https://www.callofduty.com/blog/rss", channelId: config.dedicatedChannel });
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

// Extrait le texte d'un champ XML : string simple ou objet { #text: "..." }
function textOf(val: any): string {
  return typeof val === "string" ? val : val?.["#text"] || "";
}

async function fetchPatchNotes(feed: { game: string; url: string }): Promise<PatchNote | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(feed.url, { signal: controller.signal });
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
      firstItem = Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry[0]
        : parsed.feed.entry;
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
  } catch { return null; }
}

async function summarizeWithAI(rawContent: string): Promise<string> {
  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "Tu es un assistant gaming d elite. Prends ce patch note brut et resume-le sous forme de 5 points cles indispensables pour les joueurs. Style direct, punchy, sans fioritures. Reponds en francais." },
        { role: "user", content: rawContent },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content || "Resume indisponible.";
  } catch { return "Resume indisponible (erreur IA)."; }
}

let patchCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startPatchNotesService(client: Client) {
  initFeeds();
  if (RSS_FEEDS.length === 0) { logger.info("[PatchNotes] Aucun flux RSS configure"); return; }
  logger.info("[PatchNotes] Surveillance de " + RSS_FEEDS.length + " flux RSS");
  patchCheckInterval = setInterval(() => checkAllFeeds(client), config.patchNotesIntervalMs);
  checkAllFeeds(client);
}

export function stopPatchNotesService() {
  if (patchCheckInterval) { clearInterval(patchCheckInterval); patchCheckInterval = null; }
}

async function checkAllFeeds(client: Client) {
  for (const feed of RSS_FEEDS) {
    try {
      const patchNote = await fetchPatchNotes(feed);
      if (!patchNote) continue;
      const alreadyNotified = await prisma.notification.findFirst({ where: { sourceId: "patch-" + feed.game, content: patchNote.title } });
      if (alreadyNotified) continue;
      const summary = await summarizeWithAI(patchNote.rawContent);
      const lines = summary.split(/\n\s*\n|\n(?=\d+\.|\-|\*)/).filter(Boolean).slice(0, 5);
      const embed = new EmbedBuilder()
        .setTitle(PLATFORM_LABELS["patch_notes"] + " — " + feed.game)
        .setColor(PLATFORM_COLORS["patch_notes"])
        .setDescription(lines.map((p, i) => "**" + (i + 1) + ".** " + p.trim()).join("\n") || summary)
        .setFooter({ text: "Resume genere automatiquement par IA • " + new Date().toLocaleDateString("fr-FR") })
        .setTimestamp();
      if (patchNote.url) embed.setURL(patchNote.url);
      // Ajout automatique d'image de l'article (og:image)
      try {
        if (patchNote.url) {
          const ogImage = await getOgImage(patchNote.url);
          if (ogImage) embed.setImage(ogImage);
        }
      } catch {}
      try {
        const channel = await client.channels.fetch(feed.channelId);
        if (channel?.isTextBased()) {
          await (channel as TextChannel).send({ embeds: [embed] });
          await prisma.notification.create({ data: { sourceId: "patch-" + feed.game, platform: "patch_notes", content: patchNote.title, url: patchNote.url } });
        }
      } catch (err) { logger.error("[PatchNotes] Erreur envoi Discord:", String(err)); }
    } catch (err) { logger.error("[PatchNotes] Erreur flux " + feed.game + ":", String(err)); }
  }
}
