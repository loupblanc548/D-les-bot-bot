/**
 * gameReleaseCountdown.ts — Surveille les sorties de jeux à venir via IGDB
 * et poste un embed avec compte à rebours en temps réel dans un salon vocal.
 *
 * Fonctionnalités:
 * - Récupère les sorties à venir (titre, date, jaquette, synopsis)
 * - Crée un embed riche avec compte à rebours visuel (barre de progression)
 * - Met à jour le compte à rebours toutes les heures (ou minutes si < 24h)
 * - Poste dans un salon vocal (les salons vocaux Discord supportent le texte)
 *
 * Configuration .env:
 * - GAME_RELEASE_VOICE_CHANNEL_ID : ID du salon vocal où poster
 * - IGDB_CLIENT_ID / IGDB_CLIENT_SECRET : clés API IGDB
 * - GAME_RELEASE_PLATFORM : plateforme filtrée (all, pc, playstation, xbox, switch) défaut: all
 */

import { Client, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import prisma from "../prisma.js";

const VOICE_CHANNEL_ID = process.env.GAME_RELEASE_VOICE_CHANNEL_ID || "";
const PLATFORM_FILTER = process.env.GAME_RELEASE_PLATFORM || "all";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h: refresh release list
const COUNTDOWN_UPDATE_MS = 60 * 1000; // 1 min: update countdown text
const MAX_TRACKED_GAMES = 500; // Max simultaneous countdowns — maximisé pour AAA/AA
const RELEASE_WEBHOOK_URL = process.env.GAME_RELEASE_WEBHOOK_URL || "";
const RELEASE_NOTIFICATION_ROLE = process.env.GAME_RELEASE_NOTIFICATION_ROLE || "";

// ─── Multi-server config ────────────────────────────────────────────────────
interface ServerConfig {
  channelId: string;
  platform: string;
}
const serverConfigs: ServerConfig[] = (() => {
  const raw = process.env.GAME_RELEASE_SERVERS || "";
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ServerConfig[];
  } catch {
    return [];
  }
})();

function getAllTargetChannels(): ServerConfig[] {
  if (serverConfigs.length > 0) return serverConfigs;
  if (VOICE_CHANNEL_ID) return [{ channelId: VOICE_CHANNEL_ID, platform: PLATFORM_FILTER }];
  return [];
}

// ─── Platform → Discord channel mapping ─────────────────────────────────────
// Format .env: GAME_RELEASE_PC_CHANNEL=123, GAME_RELEASE_PS_CHANNEL=456, etc.
function getPlatformChannelId(platforms: string[]): string | null {
  const map: Record<string, string> = {
    pc: process.env.GAME_RELEASE_PC_CHANNEL || "",
    steam: process.env.GAME_RELEASE_PC_CHANNEL || "",
    gog: process.env.GAME_RELEASE_PC_CHANNEL || "",
    playstation: process.env.GAME_RELEASE_PS_CHANNEL || "",
    ps: process.env.GAME_RELEASE_PS_CHANNEL || "",
    ps4: process.env.GAME_RELEASE_PS_CHANNEL || "",
    ps5: process.env.GAME_RELEASE_PS_CHANNEL || "",
    xbox: process.env.GAME_RELEASE_XBOX_CHANNEL || "",
    nintendo: process.env.GAME_RELEASE_NINTENDO_CHANNEL || "",
    switch: process.env.GAME_RELEASE_NINTENDO_CHANNEL || "",
  };

  for (const p of platforms) {
    const key = p.toLowerCase().trim();
    // Check exact match
    if (map[key]) return map[key];
    // Check partial match (e.g. "PlayStation 5" contains "playstation")
    for (const [mapKey, channelId] of Object.entries(map)) {
      if (channelId && (key.includes(mapKey) || mapKey.includes(key))) return channelId;
    }
  }
  return null;
}

function _getGuildId(): string {
  return process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || process.env.MAIN_GUILD_ID || "";
}

interface TrackedRelease {
  messageId: string | null;
  channelId: string;
  gameName: string;
  releaseDate: Date;
  coverUrl: string | null;
  summary: string;
  platforms: string[];
  genres: string[];
  posted: boolean;
  notifiedDays: Set<number>; // Track which notifications were sent (7, 1, 0)
  notifiedHour: boolean; // J-1h notification
}

const trackedReleases: TrackedRelease[] = [];
let checkInterval: NodeJS.Timeout | null = null;
let countdownInterval: NodeJS.Timeout | null = null;

type UpcomingGame = {
  name: string;
  releaseDate: Date;
  coverUrl: string | null;
  summary: string;
  platforms: string[];
  genres: string[];
};

function envSecret(name: string): string {
  const raw = String(process.env[name] || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
  return raw.split(/[\s#\u2014\u2013]+/)[0]?.replace(/^["']+|["']+$/g, "") || "";
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/** Parse Steam store search dates like "8 Sep, 2026". */
export function parseSteamSearchDate(text: string): Date | null {
  const cleaned = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /coming soon|to be announced|^tba$/i.test(cleaned)) return null;
  const m = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(m[1]);
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

// ─── IGDB: Fetch upcoming releases ──────────────────────────────────────────

const PLATFORM_MAP: Record<string, number> = {
  pc: 6,
  playstation: 48,
  xbox: 49,
  switch: 130,
  all: -1,
};

async function fetchUpcomingReleases(): Promise<UpcomingGame[]> {
  const clientId = envSecret("IGDB_CLIENT_ID");
  const clientSecret = envSecret("IGDB_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    logger.info("[GameReleaseCountdown] IGDB non configuré — fallback Steam/RAWG");
    return [];
  }
  if (clientId.length < 20) {
    logger.warn(
      "[GameReleaseCountdown] IGDB_CLIENT_ID invalide (app Twitch requise sur https://dev.twitch.tv/console/apps)",
    );
    return [];
  }

  try {
    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) {
      logger.warn(`[GameReleaseCountdown] IGDB token HTTP ${tokenRes.status}`);
      return [];
    }
    const token = (await tokenRes.json()) as { access_token: string };

    const platformId = PLATFORM_MAP[PLATFORM_FILTER.toLowerCase()] ?? -1;
    const nowSec = Math.floor(Date.now() / 1000);

    // Fetch ALL upcoming games — AAA/AA prioritized via hypes, no limit
    const body =
      platformId >= 0
        ? `fields name,first_release_date,summary,cover.image_id,platforms.name,genres.name,hypes; where first_release_date > ${nowSec} & first_release_date < ${nowSec + 365 * 86400} & platforms = (${platformId}); sort hypes desc; limit 500;`
        : `fields name,first_release_date,summary,cover.image_id,platforms.name,genres.name,hypes; where first_release_date > ${nowSec} & first_release_date < ${nowSec + 365 * 86400}; sort hypes desc; limit 500; offset 0;`;

    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "text/plain",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn(`[GameReleaseCountdown] IGDB games HTTP ${res.status}`);
      return [];
    }

    const games = (await res.json()) as Array<{
      name: string;
      first_release_date: number;
      summary?: string;
      cover?: { image_id: string };
      platforms?: Array<{ name: string }>;
      genres?: Array<{ name: string }>;
      hypes?: number;
    }>;

    // Filter: maximize AAA/AA — keep everything except pure indie with no hypes
    const result = games
      .filter((g) => {
        const isPureIndie = (g.genres || []).every((gen) => gen.name.toLowerCase() === "indie");
        const hypes = g.hypes || 0;
        // Keep if: has hypes (AAA/AA), OR not pure indie
        return hypes > 0 || !isPureIndie;
      })
      .sort((a, b) => {
        // Sort by hypes desc first, then by release date asc
        const hypesDiff = (b.hypes || 0) - (a.hypes || 0);
        if (hypesDiff !== 0) return hypesDiff;
        return a.first_release_date - b.first_release_date;
      })
      .map((g) => ({
        name: g.name,
        releaseDate: new Date(g.first_release_date * 1000),
        coverUrl: g.cover
          ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
          : null,
        summary: g.summary || "Aucun synopsis disponible.",
        platforms: g.platforms?.map((p) => p.name) ?? [],
        genres: g.genres?.map((g2) => g2.name) ?? [],
      }));

    // Cache to DB
    try {
      await prisma.gameReleaseCache.deleteMany({
        where: { fetchedAt: { lt: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
      });
      await prisma.gameReleaseCache.createMany({
        data: result.map((r) => ({
          gameName: r.name,
          releaseDate: r.releaseDate,
          coverUrl: r.coverUrl,
          summary: r.summary,
          platforms: r.platforms.join(","),
          genres: r.genres.join(","),
        })),
        skipDuplicates: true,
      });
    } catch (dbErr) {
      logger.debug(
        `[GameReleaseCountdown] Cache DB échoué: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      );
    }

    return result;
  } catch (err) {
    // Try DB cache as fallback
    try {
      const cached = await prisma.gameReleaseCache.findMany({
        where: { releaseDate: { gt: new Date() } },
        orderBy: { releaseDate: "asc" },
        take: MAX_TRACKED_GAMES,
      });
      if (cached.length > 0) {
        logger.info(`[GameReleaseCountdown] Utilisation cache DB (${cached.length} jeux)`);
        return cached.map((c) => ({
          name: c.gameName,
          releaseDate: c.releaseDate,
          coverUrl: c.coverUrl,
          summary: c.summary,
          platforms: c.platforms.split(",").filter(Boolean),
          genres: c.genres.split(",").filter(Boolean),
        }));
      }
    } catch {
      logger.error("[Silent catch]");
    }
    logger.error(
      `[GameReleaseCountdown] Erreur fetch IGDB: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ─── Countdown helpers ──────────────────────────────────────────────────────

function formatCountdown(target: Date): string {
  const now = Date.now();
  const diff = target.getTime() - now;

  if (diff <= 0) return "🎉 **SORTI MAINTENANT !**";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) {
    return `⏰ **${days}j ${hours}h ${minutes}m**`;
  }
  if (hours > 0) {
    return `⏰ **${hours}h ${minutes}m ${seconds}s**`;
  }
  return `⏰ **${minutes}m ${seconds}s**`;
}

function buildCountdownBar(target: Date, totalSpanMs: number): string {
  const now = Date.now();
  const diff = target.getTime() - now;
  const elapsed = totalSpanMs - diff;
  const progress = Math.max(0, Math.min(1, elapsed / totalSpanMs));
  const filled = Math.round(progress * 20);
  const empty = 20 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${Math.round(progress * 100)}%`;
}

function buildReleaseEmbed(release: TrackedRelease): EmbedBuilder {
  const totalSpan = 90 * 24 * 60 * 60 * 1000; // 90 days span for progress bar

  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${release.gameName}`)
    .setColor(0x5865f2)
    .addFields(
      {
        name: "📅 Date de sortie",
        value: release.releaseDate.toLocaleDateString("fr-FR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        inline: true,
      },
      {
        name: "⏳ Compte à rebours",
        value: formatCountdown(release.releaseDate),
        inline: true,
      },
      {
        name: "📊 Progression",
        value: buildCountdownBar(release.releaseDate, totalSpan),
        inline: false,
      },
      {
        name: "🎯 Plateformes",
        value: release.platforms.length > 0 ? release.platforms.join(", ") : "Non spécifié",
        inline: true,
      },
      {
        name: "🏷️ Genres",
        value: release.genres.length > 0 ? release.genres.join(", ") : "Non spécifié",
        inline: true,
      },
      {
        name: "📖 Synopsis",
        value: release.summary.slice(0, 1024) || "Aucun synopsis disponible.",
        inline: false,
      },
    )
    .setFooter({
      text: "Game Release Countdown • Mise à jour automatique • IGDB",
    })
    .setTimestamp();

  if (release.coverUrl) {
    embed.setThumbnail(release.coverUrl);
    embed.setImage(release.coverUrl);
  }

  return embed;
}

// ─── Core logic ─────────────────────────────────────────────────────────────

async function refreshReleaseList(_client: Client): Promise<void> {
  if (!VOICE_CHANNEL_ID) {
    logger.debug("[GameReleaseCountdown] Pas de GAME_RELEASE_VOICE_CHANNEL_ID configuré");
    return;
  }

  let allReleases = await fetchUpcomingReleases();
  if (allReleases.length === 0) {
    logger.warn("[GameReleaseCountdown] IGDB vide — fallback Steam puis RAWG");
    allReleases = await fetchSteamUpcoming();
  }
  if (allReleases.length === 0) {
    allReleases = await fetchRawgUpcoming();
  }
  if (allReleases.length === 0) {
    allReleases = await fetchReleasesFallback();
  }
  if (allReleases.length === 0) return;

  logger.info(`[GameReleaseCountdown] ${allReleases.length} sorties récupérées`);

  // Track the next N releases (closest dates first, already sorted by IGDB)
  const toTrack = allReleases.slice(0, MAX_TRACKED_GAMES);

  // Remove tracked releases that are no longer in the new list or have passed
  for (let i = trackedReleases.length - 1; i >= 0; i--) {
    const tracked = trackedReleases[i];
    const stillRelevant = toTrack.some(
      (r) =>
        r.name === tracked.gameName && r.releaseDate.getTime() === tracked.releaseDate.getTime(),
    );
    const hasPassed = tracked.releaseDate.getTime() < Date.now() - 24 * 60 * 60 * 1000; // 24h after release

    if (!stillRelevant || hasPassed) {
      trackedReleases.splice(i, 1);
    }
  }

  // Add new releases
  for (const release of toTrack) {
    const alreadyTracked = trackedReleases.some(
      (t) =>
        t.gameName === release.name && t.releaseDate.getTime() === release.releaseDate.getTime(),
    );
    if (!alreadyTracked) {
      trackedReleases.push({
        messageId: null,
        channelId: VOICE_CHANNEL_ID,
        gameName: release.name,
        releaseDate: release.releaseDate,
        coverUrl: release.coverUrl,
        summary: release.summary,
        platforms: release.platforms,
        genres: release.genres,
        posted: false,
        notifiedDays: new Set<number>(),
        notifiedHour: false,
      });
    }
  }

  // Ne plus poster de messages dans le salon stream — la page showcase gère l'affichage
  // Marquer comme posté sans envoyer de message Discord
  for (const tracked of trackedReleases) {
    if (!tracked.posted) {
      tracked.posted = true;
      logger.info(
        `[GameReleaseCountdown] Tracké (sans post): ${tracked.gameName} (${tracked.releaseDate.toDateString()})`,
      );
    }
  }
}

// ─── Fallback API: RAWG (upcoming calendar) ─────────────────────────────────
async function fetchRawgUpcoming(): Promise<UpcomingGame[]> {
  const key = envSecret("RAWG_API_KEY");
  if (!key || key.length < 20) return [];
  logger.info("[GameReleaseCountdown] Fallback RAWG...");
  try {
    const start = new Date();
    const end = new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000);
    const dates = `${start.toISOString().slice(0, 10)},${end.toISOString().slice(0, 10)}`;
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&dates=${dates}&ordering=-added&page_size=40`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      logger.warn(`[GameReleaseCountdown] RAWG HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      results?: Array<{
        name?: string;
        released?: string | null;
        background_image?: string | null;
        platforms?: Array<{ platform?: { name?: string } }>;
        genres?: Array<{ name?: string }>;
      }>;
    };
    const now = Date.now() - 60 * 60 * 1000;
    const games = (data.results || [])
      .map((g) => {
        const releaseDate = g.released ? new Date(`${g.released}T12:00:00Z`) : null;
        if (!g.name || !releaseDate || Number.isNaN(releaseDate.getTime())) return null;
        if (releaseDate.getTime() < now) return null;
        return {
          name: g.name,
          releaseDate,
          coverUrl: g.background_image || null,
          summary: "Fiche RAWG — sortie à venir.",
          platforms: (g.platforms || []).map((p) => p.platform?.name || "").filter(Boolean),
          genres: (g.genres || []).map((x) => x.name || "").filter(Boolean),
        } satisfies UpcomingGame;
      })
      .filter((g): g is UpcomingGame => g !== null);
    if (games.length > 0) {
      logger.info(`[GameReleaseCountdown] ${games.length} sorties via RAWG`);
    }
    return games;
  } catch (err) {
    logger.warn(
      `[GameReleaseCountdown] Fallback RAWG échoué: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ─── Fallback API: Steam popular coming soon (no key) ───────────────────────
async function fetchSteamUpcoming(): Promise<UpcomingGame[]> {
  logger.info("[GameReleaseCountdown] Fallback Steam coming soon...");
  try {
    const url =
      "https://store.steampowered.com/search/results/?filter=popularcomingsoon&category1=998&infinite=1&start=0&count=40&cc=FR&l=english";
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json,text/javascript,*/*",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      logger.warn(`[GameReleaseCountdown] Steam search HTTP ${res.status}`);
      return [];
    }
    const payload = (await res.json()) as { results_html?: string };
    const html = payload.results_html || "";
    const blocks = html.split(/data-ds-appid="/).slice(1);
    const skip = /\bdemo\b|soundtrack|playtest|\bost\b|artbook|trailer/i;
    const now = Date.now() - 60 * 60 * 1000;
    const seen = new Set<string>();
    const games: UpcomingGame[] = [];
    for (const block of blocks) {
      const id = block.match(/^(\d+)/)?.[1];
      const name = block.match(/class="title">([^<]+)/)?.[1]?.trim();
      const dateText = block.match(/search_released[^>]*>([^<]*)/)?.[1]?.trim() || "";
      if (!id || !name || skip.test(name) || seen.has(name)) continue;
      const releaseDate = parseSteamSearchDate(dateText);
      if (!releaseDate || releaseDate.getTime() < now) continue;
      seen.add(name);
      games.push({
        name,
        releaseDate,
        coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`,
        summary: "Sortie à venir sur Steam.",
        platforms: ["PC"],
        genres: [],
      });
    }
    if (games.length > 0) {
      logger.info(`[GameReleaseCountdown] ${games.length} sorties via Steam`);
    }
    return games;
  } catch (err) {
    logger.warn(
      `[GameReleaseCountdown] Fallback Steam échoué: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ─── Fallback API: CheapShark (free, no key needed) ──────────────────────────
async function fetchReleasesFallback(): Promise<UpcomingGame[]> {
  try {
    const res = await fetch(
      "https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Release&desc=0&pageSize=10",
      {
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];
    const deals = (await res.json()) as Array<{
      title: string;
      releaseDate: number;
      steamAppID: string | null;
      thumb: string | null;
    }>;
    return deals
      .filter((d) => d.releaseDate > 0)
      .map((d) => ({
        name: d.title,
        releaseDate: new Date(d.releaseDate * 1000),
        coverUrl: d.thumb || null,
        summary: "Jeu disponible sur Steam.",
        platforms: ["PC"],
        genres: [],
      }))
      .filter((d) => d.releaseDate.getTime() > Date.now())
      .slice(0, MAX_TRACKED_GAMES);
  } catch (err) {
    logger.warn(
      `[GameReleaseCountdown] Fallback CheapShark échoué: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ─── Webhook notifications ───────────────────────────────────────────────────
async function sendWebhookNotification(release: TrackedRelease, daysLeft: number): Promise<void> {
  if (!RELEASE_WEBHOOK_URL) return;
  try {
    await fetch(RELEASE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🎮 ${release.gameName} sort dans ${daysLeft} jour(s) ! (${release.releaseDate.toLocaleDateString("fr-FR")})`,
        game: release.gameName,
        releaseDate: release.releaseDate.toISOString(),
        daysLeft,
        platforms: release.platforms,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.debug(
      `[GameReleaseCountdown] Webhook échoué: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Notifications J-7, J-1, J-0 ─────────────────────────────────────────────
async function checkReleaseNotifications(client: Client): Promise<void> {
  for (const tracked of trackedReleases) {
    const daysLeft = Math.ceil(
      (tracked.releaseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const hoursLeft = (tracked.releaseDate.getTime() - Date.now()) / (1000 * 60 * 60);
    const notificationDays = [7, 1, 0];

    // J-1h notification
    if (hoursLeft <= 1 && hoursLeft > 0 && !tracked.notifiedHour) {
      tracked.notifiedHour = true;
      const roleMention = RELEASE_NOTIFICATION_ROLE ? `<@&${RELEASE_NOTIFICATION_ROLE}> ` : "";
      const message = `${roleMention}⏳ **${tracked.gameName}** sort dans moins d'1 heure ! Préparez-vous ! 🔥`;

      const platformChannelId = getPlatformChannelId(tracked.platforms);
      const targetChannelIds = (
        platformChannelId ? [platformChannelId] : getAllTargetChannels().map((t) => t.channelId)
      ).filter((id) => id !== VOICE_CHANNEL_ID); // Ne pas notifier dans le salon vocal

      for (const channelId of targetChannelIds) {
        try {
          const channel = client.channels.cache.get(channelId);
          if (channel && "send" in channel) {
            await channel.send({ content: message });
            logger.info(
              `[GameReleaseCountdown] Notif J-1h: ${tracked.gameName} → salon ${channelId}`,
            );
          }
        } catch (err) {
          logger.error(
            `[GameReleaseCountdown] Erreur notif J-1h: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    for (const days of notificationDays) {
      if (daysLeft === days && !tracked.notifiedDays.has(days)) {
        tracked.notifiedDays.add(days);

        const emoji = days === 0 ? "🎉" : days === 1 ? "🔥" : "⏰";
        const roleMention = RELEASE_NOTIFICATION_ROLE ? `<@&${RELEASE_NOTIFICATION_ROLE}> ` : "";
        const message =
          days === 0
            ? `${roleMention}${emoji} **${tracked.gameName}** sort AUJOURD'HUI ! 🎊`
            : `${roleMention}${emoji} **${tracked.gameName}** sort dans ${days} jour(s) !`;

        // Determine target channel based on platform
        const platformChannelId = getPlatformChannelId(tracked.platforms);

        let targetChannelIds: string[];

        if (platformChannelId) {
          // Use dedicated platform channel
          targetChannelIds = [platformChannelId];
        } else {
          // Fallback to all target channels
          targetChannelIds = getAllTargetChannels().map((t) => t.channelId);
        }
        // Ne pas notifier dans le salon vocal (réservé au stream)
        targetChannelIds = targetChannelIds.filter((id) => id !== VOICE_CHANNEL_ID);

        for (const channelId of targetChannelIds) {
          try {
            const channel = client.channels.cache.get(channelId);
            if (channel && "send" in channel) {
              const embed = buildReleaseEmbed(tracked);
              const platformLabel =
                tracked.platforms.length > 0 ? tracked.platforms.join(", ") : "Multi-plateforme";
              const pageUrl = `http://localhost:3000/releases?platform=${encodeURIComponent(tracked.platforms[0] || "all")}`;
              embed.addFields({
                name: "🔗 Page countdown",
                value: `[Voir le compte à rebours](${pageUrl})`,
                inline: false,
              });
              await channel.send({
                content: `${message}\n*Plateforme: ${platformLabel}*`,
                embeds: [embed],
              });
              logger.info(
                `[GameReleaseCountdown] Notif J-${days}: ${tracked.gameName} → salon ${channelId}`,
              );
            }
          } catch (err) {
            logger.error(
              `[GameReleaseCountdown] Erreur notif J-${days}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        // Webhook
        await sendWebhookNotification(tracked, days);
      }
    }
  }
}

async function updateCountdowns(client: Client): Promise<void> {
  if (trackedReleases.length === 0) return;

  // Check for J-7, J-1, J-0 notifications
  await checkReleaseNotifications(client);

  // Post release history when games come out — only in platform channels, NOT voice channel
  for (const tracked of trackedReleases) {
    // Post a "released" message when the game comes out (J-0)
    if (tracked.releaseDate.getTime() <= Date.now() && !tracked.notifiedDays.has(0)) {
      tracked.notifiedDays.add(0);
      const platformChannelId = getPlatformChannelId(tracked.platforms);
      const historyChannelIds = (
        platformChannelId ? [platformChannelId] : getAllTargetChannels().map((t) => t.channelId)
      ).filter((id) => id !== VOICE_CHANNEL_ID);
      for (const channelId of historyChannelIds) {
        try {
          const histChannel = client.channels.cache.get(channelId);
          if (histChannel && "send" in histChannel) {
            const embed = buildReleaseEmbed(tracked);
            embed.setColor(0x00d26a);
            embed.setTitle(`🎉 ${tracked.gameName} — Sorti aujourd'hui !`);
            const platformLabel =
              tracked.platforms.length > 0 ? tracked.platforms.join(", ") : "Multi-plateforme";
            await (histChannel as any).send({
              content: `📜 **Historique des sorties**\n🎮 **${tracked.gameName}** est maintenant disponible !\n*Plateforme: ${platformLabel}*`,
              embeds: [embed],
            });
            logger.info(
              `[GameReleaseCountdown] Historique posté: ${tracked.gameName} → salon ${channelId}`,
            );
          }
        } catch (err) {
          logger.error(
            `[GameReleaseCountdown] Erreur post historique: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // Remove releases that are more than 24h past
    if (tracked.releaseDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      trackedReleases.splice(trackedReleases.indexOf(tracked), 1);
      continue;
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startGameReleaseCountdown(client: Client): void {
  if (!VOICE_CHANNEL_ID) {
    logger.info("[GameReleaseCountdown] Désactivé — GAME_RELEASE_VOICE_CHANNEL_ID non configuré");
    return;
  }

  if (checkInterval || countdownInterval) return;

  logger.info(
    `[GameReleaseCountdown] Activé — salon: ${VOICE_CHANNEL_ID}, plateforme: ${PLATFORM_FILTER}`,
  );

  // Initial fetch after 10s (let bot connect first)
  setTimeout(() => {
    void refreshReleaseList(client).catch((e) =>
      logger.error(
        `[GameReleaseCountdown] Erreur init: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }, 3_000);

  // Refresh release list every 6 hours
  checkInterval = safeInterval(
    "GameReleaseCountdown",
    () => {
      void refreshReleaseList(client).catch((e) =>
        logger.error(
          `[GameReleaseCountdown] Erreur refresh: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    },
    CHECK_INTERVAL_MS,
  );

  // Update countdowns every minute
  countdownInterval = safeInterval(
    "GameReleaseCountdownTimer",
    () => {
      void updateCountdowns(client).catch((e) =>
        logger.error(
          `[GameReleaseCountdown] Erreur countdown: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    },
    COUNTDOWN_UPDATE_MS,
  );
}

export function stopGameReleaseCountdown(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

export function getTrackedReleases(): TrackedRelease[] {
  return trackedReleases;
}
