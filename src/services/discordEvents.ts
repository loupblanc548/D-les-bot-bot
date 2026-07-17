/**
 * discordEvents.ts — Crée automatiquement des événements Discord pour les sorties de jeux
 * Utilise l'API Guild Scheduled Events de Discord
 */

import { Client, GuildScheduledEventEntityType } from "discord.js";
import logger from "../utils/logger.js";
import { getTrackedReleases } from "./gameReleaseCountdown.js";

const createdEventIds = new Set<string>();
let eventsInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL = 60 * 60 * 1000; // 1h

export function startDiscordEventsService(client: Client): void {
  const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || "";
  if (!guildId) {
    logger.info("[DiscordEvents] Désactivé — DISCORD_GUILD_ID non configuré");
    return;
  }

  logger.info("[DiscordEvents] Service activé — création d'événements pour les sorties de jeux");

  setTimeout(() => {
    void syncGameEvents(client, guildId).catch((e) =>
      logger.error(`[DiscordEvents] Erreur init: ${e instanceof Error ? e.message : String(e)}`),
    );
  }, 15_000);

  eventsInterval = setInterval(() => {
    void syncGameEvents(client, guildId).catch((e) =>
      logger.error(`[DiscordEvents] Erreur sync: ${e instanceof Error ? e.message : String(e)}`),
    );
  }, CHECK_INTERVAL);

  if (eventsInterval.unref) eventsInterval.unref();
}

export function stopDiscordEventsService(): void {
  if (eventsInterval) {
    clearInterval(eventsInterval);
    eventsInterval = null;
  }
}

async function syncGameEvents(client: Client, guildId: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const releases = getTrackedReleases();
  const now = Date.now();
  const maxFuture = 90 * 24 * 60 * 60 * 1000; // 90 days

  for (const release of releases) {
    const eventKey = `${release.gameName}-${release.releaseDate.toISOString()}`;
    if (createdEventIds.has(eventKey)) continue;

    const timeUntil = release.releaseDate.getTime() - now;
    if (timeUntil <= 0 || timeUntil > maxFuture) continue;

    try {
      const event = await guild.scheduledEvents.create({
        name: `🎮 ${release.gameName}`,
        description: `Sortie de **${release.gameName}** !\n\nPlateformes: ${release.platforms.join(", ") || "N/A"}\nGenres: ${release.genres.join(", ") || "N/A"}\n\n${release.summary.slice(0, 500)}`,
        scheduledStartTime: release.releaseDate,
        scheduledEndTime: new Date(release.releaseDate.getTime() + 2 * 60 * 60 * 1000),
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: "Sortie jeu" },
        privacyLevel: 2,
        reason: "Création automatique — Game Release Countdown",
      });

      createdEventIds.add(eventKey);
      logger.info(`[DiscordEvents] Événement créé: ${release.gameName} (${event.id})`);
    } catch (err) {
      logger.debug(
        `[DiscordEvents] Erreur création ${release.gameName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Clean up old event IDs (keep memory small)
  if (createdEventIds.size > 100) {
    createdEventIds.clear();
  }
}
