import { Client, EmbedBuilder, TextChannel } from "discord.js";
import prisma from "../prisma";
import logger from "../utils/logger";
import { config } from "../config";
import { retry } from "../utils/retry";
import { validateRssItem, sanitizeString } from "../utils/validation";
import { dbCache } from "../utils/cache";
import { metricsCollector } from "../utils/metrics";
import { dedupCache } from "../utils/deduplicationCache";

// Types

type RedditFeedItem = {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  guid: string;
  isoDate: string;
};

type Platform = "epic" | "steam" | "playstation" | "xbox" | "nintendo";

interface PlatformConfig {
  channelId: string | undefined;
  color: number;
  iconUrl: string;
  label: string;
}

// Constantes

const RSS_FEED_URL = "https://api.rss2json.com/v1/api.json?rss_url=https://www.reddit.com/r/patchnotes/.rss";
const FOOTER = { text: "Patch Notes Tracker • Surveillance automatique" };

// Configuration des plateformes

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  epic: {
    channelId: config.steamEpicChannel,
    color: 0x2a2a2a,
    iconUrl: "https://store.epicgames.com/favicon.ico",
    label: "Epic Games",
  },
  steam: {
    channelId: config.steamEpicChannel,
    color: 0x000080,
    iconUrl: "https://store.steampowered.com/favicon.ico",
    label: "Steam",
  },
  playstation: {
    channelId: config.playstationChannel,
    color: 0x003791,
    iconUrl: "https://www.playstation.com/favicon.ico",
    label: "PlayStation",
  },
  xbox: {
    channelId: config.xboxChannel,
    color: 0x107c10,
    iconUrl: "https://www.xbox.com/favicon.ico",
    label: "Xbox",
  },
  nintendo: {
    channelId: config.nintendoChannel,
    color: 0xe60012,
    iconUrl: "https://www.nintendo.com/favicon.ico",
    label: "Nintendo Switch",
  },
};

// Etat interne

let intervalId: ReturnType<typeof setInterval> | null = null;
let isChecking = false;
let checkCount = 0;

// Detection des plateformes

/**
 * Detecte TOUTES les plateformes mentionnees dans le titre.
 * Un patch note peut etre multiplateforme => route vers chaque salon.
 */
function detectPlatforms(title: string): Platform[] {
  const t = title.toLowerCase();
  const platforms: Platform[] = [];

  if (/\b(epic|epic games)\b/.test(t)) {
    platforms.push("epic");
  }
  if (/\b(steam|gog|pc)\b/.test(t)) {
    platforms.push("steam");
  }
  if (/\b(ps4|ps5|playstation|psn)\b/.test(t)) {
    platforms.push("playstation");
  }
  if (/\b(xbox|series\s*[xs]|xbl|microsoft)\b/.test(t)) {
    platforms.push("xbox");
  }
  if (/\b(switch|nintendo)\b/.test(t)) {
    platforms.push("nintendo");
  }

  return platforms;
}

/**
 * Nettoie le contenu HTML pour générer un résumé propre
 * @param content - Contenu brut avec HTML
 * @returns Résumé nettoyé (400-500 caractères)
 */
function cleanSummary(content: string): string {
  // Supprimer les balises HTML
  const cleanText = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Limiter à 400-500 caractères
  return cleanText.length > 500 ? cleanText.slice(0, 497) + '...' : cleanText;
}

/**
 * Vérifie si un patch note a déjà été traité
 * @param guid - Identifiant unique du patch note
 * @returns true si déjà traité, false sinon
 */
async function isPatchProcessed(guid: string): Promise<boolean> {
  const cached = dbCache.get(guid);
  if (cached !== undefined) return cached;
  
  try {
    const existing = await prisma.processedPatchNotes.findUnique({ where: { guid } });
    const result = !!existing;
    dbCache.set(guid, result);
    return result;
  } catch (error) {
    logger.warn(`[PatchNotesCron] Erreur verification ProcessedPatchNotes: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Marque un patch note comme traité dans la base de données
 * @param guid - Identifiant unique du patch note
 * @param title - Titre du patch note
 */
async function markPatchProcessed(guid: string, title: string): Promise<void> {
  try {
    await prisma.processedPatchNotes.create({ data: { guid, title: title.slice(0, 255) } });
    dbCache.set(guid, true);
  } catch {
    logger.debug("[PatchNotesCron] Patch note deja persiste, ignore");
  }
}

// Resolution des salons

async function resolveChannel(
  client: Client,
  channelId: string
): Promise<TextChannel | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      logger.error(
        "[PatchNotesCron] Salon " + channelId + " introuvable ou non textuel"
      );
      return null;
    }
    return channel as TextChannel;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      "[PatchNotesCron] Erreur fetch salon " + channelId + ": " + msg
    );
    return null;
  }
}

// Fonction principale de verification

async function checkTrackedGames(client: Client): Promise<void> {
  // 🔒 Recharge le cache anti-doublon depuis le disque (persistance inter-cycles)
  await dedupCache.reloadFromDisk();
  // Securite anti-crash : verification stricte des variables d'environnement
  const activePlatforms = (Object.keys(PLATFORM_CONFIGS) as Platform[]).filter(
    (p) => PLATFORM_CONFIGS[p].channelId
  );

  if (activePlatforms.length === 0) {
    logger.warn(
      "[PatchNotesCron] Aucun CHANNEL_ID configure (STEAM_EPIC_CHANNEL_ID, PLAYSTATION_CHANNEL_ID, XBOX_CHANNEL_ID, NINTENDO_CHANNEL_ID) — cron desactive"
    );
    return;
  }

  if (isChecking) {
    logger.info("[PatchNotesCron] Verification deja en cours, ignoree");
    return;
  }

  isChecking = true;
  const startTime = Date.now();
  let patchesSent = 0;

  try {
    checkCount++;
    logger.info(
      "[PatchNotesCron] Verification #" + checkCount + " — fetch RSS Reddit r/patchnotes..."
    );

    let feed: Record<string, unknown>;
    try {
      // Utiliser rss2json avec retry logic
      feed = await retry(
        async () => {
          const response = await fetch(RSS_FEED_URL);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        },
        3,
        1000
      ) as Record<string, unknown>;
    } catch (rssError) {
      const msg =
        rssError instanceof Error ? rssError.message : String(rssError);
      logger.warn("[PatchNotesCron] Flux Reddit inaccessible: " + msg);
      return;
    }

    if (!(feed as Record<string, any>)?.items?.length) {
      logger.info("[PatchNotesCron] Aucun article trouve dans le flux");
      return;
    }

    logger.info(
      "[PatchNotesCron] " + (feed as Record<string, any>).items.length + " article(s) recupere(s) du flux RSS"
    );

    // Deduplication via ProcessedPatchNotes (guid)
    const freshItems: RedditFeedItem[] = [];
    for (const item of ((feed as Record<string, any>).items || [])) {
      const guid = item.guid || item.link || item.title;
      if (!guid) continue;
      
      if (!(await isPatchProcessed(guid))) {
        // VERROU ANTI-SPAM : dedup cache JSON local
        if (dedupCache.isAlreadyProcessed("patch_notes", guid)) {
          logger.debug(`[SPAM BLOQUE] SteamNews doublon cache: ${guid}`);
          continue;
        }
        freshItems.push(item);
      }
    }

    if (freshItems.length === 0) {
      logger.info("[PatchNotesCron] Tous les articles sont deja connus");
      return;
    }

    logger.info(
      "[PatchNotesCron] " + freshItems.length + " nouveau(x) article(s) a router"
    );

    // Routage multi-plateforme
    for (const item of freshItems) {
      // ⏱️ 🔒 Barriere temporelle 24h (anti-spam strict) : ignorer les articles trop anciens (evite le anti-spam strict))
      const articleDate = new Date(item.pubDate);
      const limitDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (isNaN(articleDate.getTime()) || articleDate < limitDate) continue;

      const title = item.title ?? "Sans titre";
      const platforms = detectPlatforms(title);
      const uniquePlatforms = [...new Set(platforms)];

      // Si aucune plateforme détectée, ignorer
      if (uniquePlatforms.length === 0) {
        logger.debug(`[PatchNotesCron] Plateforme non detectee pour: ${title.slice(0, 80)}`);
        continue;
      }

      const link = item.link ?? "";
      const description = cleanSummary(
        item.contentSnippet || item.content || "Nouveau patch note disponible !"
      );
      const pubDateStr = item.pubDate
        ? "<t:" + Math.floor(new Date(item.pubDate).getTime() / 1000) + ":D>"
        : "Date inconnue";

      let sent = false;

      for (const platform of uniquePlatforms) {
        const cfg = PLATFORM_CONFIGS[platform];
        if (!cfg.channelId) {
          logger.warn(`[PatchNotesCron] CHANNEL_ID manquant pour ${platform}, skip`);
          continue;
        }

        const channel = await resolveChannel(client, cfg.channelId);
        if (!channel) continue;

        const embed = new EmbedBuilder()
          .setTitle("📋 " + title)
          .setURL(link)
          .setColor(cfg.color)
          .setAuthor({
            name: cfg.label,
            iconURL: cfg.iconUrl,
          })
          .setDescription(description)
          .addFields(
            { name: "📅 Publie le", value: pubDateStr, inline: true },
            { name: "🔗 Lien", value: link ? "[Voir le patch note](" + link + ")" : "Lien indisponible", inline: true },
            { name: "🖥️ Plateforme", value: cfg.label, inline: true }
          )
          .setFooter(FOOTER)
          .setTimestamp();

        try {
          await channel.send({
            content: "📋 **Nouveau patch note detecte sur " + cfg.label + " !**",
            embeds: [embed],
          });
          sent = true;
          logger.info(
            "[PatchNotesCron] ✓ " + cfg.label + " : \"" + title.slice(0, 80) + "\""
          );
        } catch (sendError) {
          const sendMsg =
            sendError instanceof Error ? sendError.message : String(sendError);
          logger.error(
            "[PatchNotesCron] ✗ Echec envoi " + cfg.label + ": " + sendMsg
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Persister dans la BDD (une seule fois, meme si multi-plateforme)
      const guid = item.guid || item.link || item.title;
      if (guid) {
        // Marquer dans le cache JSON anti-doublon
        await dedupCache.markAsProcessed("patch_notes", guid);
        await markPatchProcessed(guid, title);
        if (sent) patchesSent++;
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      "[PatchNotesCron] ✓ " + patchesSent + " patch note(s) envoye(s) en " + (elapsed / 1000).toFixed(1) + "s"
    );
    
    // Enregistrer les métriques
    metricsCollector.recordProcessing("patchNotes", true, elapsed);
  } catch (error) {
    logger.error(
      "[PatchNotesCron] Erreur critique: " + (error instanceof Error ? error.message : String(error)),
      { stack: error instanceof Error ? error.stack : undefined }
    );
    metricsCollector.recordProcessing("patchNotes", false, Date.now() - startTime);
  } finally {
    isChecking = false;
  }
}

// Demarrage / Arret

export { checkTrackedGames, PLATFORM_CONFIGS };

export function startSteamNewsMonitoring(client: Client): void {
  if (intervalId) {
    logger.warn("[PatchNotesCron] Deja actif — ignore");
    return;
  }

  const intervalMs = 600000; // 10 minutes

  logger.info(
    "[PatchNotesCron] Demarrage — intervalle " + (intervalMs / 60000).toFixed(1) + " min"
  );

  checkTrackedGames(client).catch((err) =>
    logger.error(
      "[PatchNotesCron] Erreur check initial: " + (err instanceof Error ? err.message : String(err)),
      { stack: err instanceof Error ? err.stack : undefined }
    )
  );

  intervalId = setInterval(() => {
    checkTrackedGames(client).catch((err) =>
      logger.error(
        "[PatchNotesCron] Erreur check periodique: " + (err instanceof Error ? err.message : String(err)),
        { stack: err instanceof Error ? err.stack : undefined }
      )
    );
  }, intervalMs);
}

export function stopSteamNewsMonitoring(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("[PatchNotesCron] Arrete");
  }
}
