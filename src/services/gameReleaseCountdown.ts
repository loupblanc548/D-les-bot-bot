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

import { Client, EmbedBuilder, Message } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { isIgdbAvailable, searchGame } from "./igdb.js";

const VOICE_CHANNEL_ID = process.env.GAME_RELEASE_VOICE_CHANNEL_ID || "";
const PLATFORM_FILTER = process.env.GAME_RELEASE_PLATFORM || "all";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h: refresh release list
const COUNTDOWN_UPDATE_MS = 60 * 1000; // 1 min: update countdown text
const MAX_TRACKED_GAMES = 5; // Max simultaneous countdowns

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
}

const trackedReleases: TrackedRelease[] = [];
let checkInterval: NodeJS.Timeout | null = null;
let countdownInterval: NodeJS.Timeout | null = null;

// ─── IGDB: Fetch upcoming releases ──────────────────────────────────────────

const PLATFORM_MAP: Record<string, number> = {
  pc: 6,
  playstation: 48,
  xbox: 49,
  switch: 130,
  all: -1,
};

async function fetchUpcomingReleases(): Promise<
  Array<{
    name: string;
    releaseDate: Date;
    coverUrl: string | null;
    summary: string;
    platforms: string[];
    genres: string[];
  }>
> {
  if (!isIgdbAvailable()) {
    logger.warn("[GameReleaseCountdown] IGDB non configuré — impossible de récupérer les sorties");
    return [];
  }

  const clientId = process.env.IGDB_CLIENT_ID!;
  const clientSecret = process.env.IGDB_CLIENT_SECRET!;

  try {
    // Get Twitch OAuth token
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST", signal: AbortSignal.timeout(10_000) },
    );
    if (!tokenRes.ok) {
      logger.warn(`[GameReleaseCountdown] IGDB token HTTP ${tokenRes.status}`);
      return [];
    }
    const token = (await tokenRes.json()) as { access_token: string };

    const platformId = PLATFORM_MAP[PLATFORM_FILTER.toLowerCase()] ?? -1;
    const nowSec = Math.floor(Date.now() / 1000);

    // Fetch games releasing in the next 90 days, sorted by date
    const body =
      platformId >= 0
        ? `fields name,first_release_date,summary,cover.image_id,platforms.name,genres.name; where first_release_date > ${nowSec} & first_release_date < ${nowSec + 90 * 86400} & platforms = (${platformId}); sort first_release_date asc; limit 20;`
        : `fields name,first_release_date,summary,cover.image_id,platforms.name,genres.name; where first_release_date > ${nowSec} & first_release_date < ${nowSec + 90 * 86400}; sort first_release_date asc; limit 20;`;

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
    }>;

    return games.map((g) => ({
      name: g.name,
      releaseDate: new Date(g.first_release_date * 1000),
      coverUrl: g.cover
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
        : null,
      summary: g.summary || "Aucun synopsis disponible.",
      platforms: g.platforms?.map((p) => p.name) ?? [],
      genres: g.genres?.map((g2) => g2.name) ?? [],
    }));
  } catch (err) {
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
  const now = Date.now();
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

async function refreshReleaseList(client: Client): Promise<void> {
  if (!VOICE_CHANNEL_ID) {
    logger.debug("[GameReleaseCountdown] Pas de GAME_RELEASE_VOICE_CHANNEL_ID configuré");
    return;
  }

  const releases = await fetchUpcomingReleases();
  if (releases.length === 0) return;

  logger.info(`[GameReleaseCountdown] ${releases.length} sorties récupérées depuis IGDB`);

  // Track the next N releases (closest dates first, already sorted by IGDB)
  const toTrack = releases.slice(0, MAX_TRACKED_GAMES);

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
      });
    }
  }

  // Post new releases that haven't been posted yet
  const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
  if (!channel || !("send" in channel)) {
    logger.warn(`[GameReleaseCountdown] Salon ${VOICE_CHANNEL_ID} inaccessible ou non textuel`);
    return;
  }

  for (const tracked of trackedReleases) {
    if (!tracked.posted) {
      try {
        const embed = buildReleaseEmbed(tracked);
        const msg = await channel.send({
          content: `🚨 **Nouvelle sortie à venir !**`,
          embeds: [embed],
        });
        tracked.messageId = msg.id;
        tracked.posted = true;
        logger.info(
          `[GameReleaseCountdown] Posté: ${tracked.gameName} (${tracked.releaseDate.toDateString()})`,
        );
      } catch (err) {
        logger.error(
          `[GameReleaseCountdown] Erreur envoi ${tracked.gameName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

async function updateCountdowns(client: Client): Promise<void> {
  if (trackedReleases.length === 0) return;

  for (const tracked of trackedReleases) {
    if (!tracked.messageId) continue;

    // Remove releases that are more than 24h past
    if (tracked.releaseDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      trackedReleases.splice(trackedReleases.indexOf(tracked), 1);
      continue;
    }

    try {
      const channel = client.channels.cache.get(tracked.channelId);
      if (!channel || !("messages" in channel)) continue;

      const msg = await channel.messages.fetch(tracked.messageId).catch(() => null);
      if (!msg) continue;

      const embed = buildReleaseEmbed(tracked);
      await (msg as Message).edit({ embeds: [embed] });
    } catch (err) {
      logger.debug(
        `[GameReleaseCountdown] Erreur MAJ countdown ${tracked.gameName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startGameReleaseCountdown(client: Client): void {
  if (!VOICE_CHANNEL_ID) {
    logger.info("[GameReleaseCountdown] Désactivé — GAME_RELEASE_VOICE_CHANNEL_ID non configuré");
    return;
  }

  if (!isIgdbAvailable()) {
    logger.info("[GameReleaseCountdown] Désactivé — IGDB non configuré");
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
  }, 10_000);

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
