import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { config } from "../config.js";
import prisma from "../prisma.js";
import Parser from "rss-parser";
import { dedupCache } from "../utils/deduplicationCache.js";
import { generateStableId } from "../utils/url-cleaner.js";

interface GameUpdate {
  gameId: string;
  gameName: string;
  platform: string;
  updateType: "patch" | "maintenance" | "hotfix" | "announcement";
  title: string;
  description: string;
  url: string;
  publishedAt: Date;
}

const UPDATE_SOURCES = {
  steam: "https://store.steampowered.com/feeds/news/app/",
  epic: "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions",
  playstation: "https://blog.playstation.com/feed/",
  xbox: "https://news.xbox.com/en-us/feed/",
};

const TRACKED_GAMES = [
  { id: "730", name: "Counter-Strike 2", platform: "steam" },
  { id: "1172470", name: "Apex Legends", platform: "steam" },
  { id: "578080", name: "PUBG: Battlegrounds", platform: "steam" },
  { id: "1091500", name: "Cyberpunk 2077", platform: "steam" },
  { id: "1245620", name: "ELDEN RING", platform: "steam" },
  { id: "fortnite", name: "Fortnite", platform: "epic" },
  { id: "rocket-league", name: "Rocket League", platform: "epic" },
];

const PLATFORM_CHANNELS: Record<string, { channelId: string; color: number; emoji: string; label: string }> = {
  steam: { channelId: config.steamEpicChannel, color: 0x1b2838, emoji: "🎮", label: "Steam" },
  epic: { channelId: config.steamEpicChannel, color: 0x2a2a2a, emoji: "📦", label: "Epic Games" },
  playstation: { channelId: config.playstationChannel, color: 0x003791, emoji: "🎮", label: "PlayStation" },
  xbox: { channelId: config.xboxChannel, color: 0x107c10, emoji: "🎮", label: "Xbox" },
  nintendo: { channelId: config.nintendoChannel, color: 0xe60012, emoji: "🎮", label: "Nintendo" },
  fortnite: { channelId: config.fortniteChannel, color: 0x9147ff, emoji: "🎯", label: "Fortnite" },
};

let updateCheckInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 3600000; // 1 heure

/**
 * Vérifie les mises à jour de jeux depuis Steam
 */
async function checkSteamUpdates(): Promise<GameUpdate[]> {
  const updates: GameUpdate[] = [];
  const parser = new Parser();

  for (const game of TRACKED_GAMES.filter((g) => g.platform === "steam")) {
    try {
      const feed = await parser.parseURL(`${UPDATE_SOURCES.steam}${game.id}`);

      for (const item of feed.items.slice(0, 3)) {
        const title = item.title || "";
        const description = item.contentSnippet || item.content || "";
        const link = item.link || "";
        const pubDate = item.pubDate || "";

        // Vérifier si c'est une mise à jour
        if (
          title.toLowerCase().includes("update") ||
          title.toLowerCase().includes("patch") ||
          title.toLowerCase().includes("hotfix")
        ) {
          const update: GameUpdate = {
            gameId: game.id,
            gameName: game.name,
            platform: "steam",
            updateType: title.toLowerCase().includes("hotfix") ? "hotfix" : "patch",
            title,
            description: description.replace(/<[^>]*>/g, "").substring(0, 500),
            url: link,
            publishedAt: new Date(pubDate),
          };

          updates.push(update);
        }
      }
    } catch (error) {
      logger.error(
        `[GameUpdates] Erreur lors de la vérification des mises à jour Steam pour ${game.name}:`,
        error,
      );
    }
  }

  return updates;
}

/**
 * Vérifie si une mise à jour a déjà été traitée
 */
async function isUpdateProcessed(updateId: string): Promise<boolean> {
  const existing = await prisma.processedGameUpdate.findUnique({
    where: { updateId },
  });
  return !!existing;
}

/**
 * Marque une mise à jour comme traitée
 */
async function markUpdateProcessed(updateId: string): Promise<void> {
  await prisma.processedGameUpdate.create({
    data: { updateId },
  });
}

/**
 * Envoie une notification de mise à jour
 */
async function sendUpdateNotification(client: Client, update: GameUpdate): Promise<void> {
  const platformCfg = PLATFORM_CHANNELS[update.platform];
  const channelId = platformCfg?.channelId || config.logChannel || "";

  if (!channelId) {
    logger.warn(`[GameUpdates] Aucun salon configuré pour la plateforme ${update.platform}`);
    return;
  }

  const channel = client.channels.cache.get(channelId) as TextChannel;
  if (!channel || !channel.isTextBased()) {
    logger.warn(`[GameUpdates] Salon ${channelId} non disponible`);
    return;
  }

  const updateColors = {
    patch: 0x00ff00,
    maintenance: 0xffaa00,
    hotfix: 0xff6600,
    announcement: 0x00aaff,
  };

  const updateEmojis = {
    patch: "🔧",
    maintenance: "🔨",
    hotfix: "⚡",
    announcement: "📢",
  };

  const platformEmoji = platformCfg?.emoji || "🎮";
  const platformLabel = platformCfg?.label || update.platform.toUpperCase();

  const embed = new EmbedBuilder()
    .setTitle(
      `${updateEmojis[update.updateType]} ${update.gameName} - ${update.updateType.toUpperCase()}`,
    )
    .setDescription(update.title)
    .setColor(platformCfg?.color ?? updateColors[update.updateType])
    .addFields(
      {
        name: "Plateforme",
        value: `${platformEmoji} ${platformLabel}`,
        inline: true,
      },
      {
        name: "Type",
        value: updateEmojis[update.updateType] + " " + update.updateType.toUpperCase(),
        inline: true,
      },
      {
        name: "Publié le",
        value: update.publishedAt.toLocaleString("fr-FR"),
        inline: true,
      },
    )
    .setURL(update.url)
    .setFooter({ text: `Surveillance System • Game Updates • ${platformLabel}` })
    .setTimestamp();

  if (update.description) {
    embed.addFields({
      name: "Description",
      value: update.description,
      inline: false,
    });
  }

  try {
    await channel.send({ embeds: [embed] });
    logger.info(`[GameUpdates] Notification envoyée pour ${update.gameName} (${platformLabel}) dans #${channel.name}`);
  } catch (error) {
    logger.error("[GameUpdates] Erreur lors de l'envoi de la notification:", error);
  }
}

/**
 * Vérifie et traite les mises à jour de jeux
 */
export async function checkGameUpdates(client: Client): Promise<void> {
  logger.info("[GameUpdates] Vérification des mises à jour de jeux...");

  const updates = await checkSteamUpdates();

  for (const update of updates) {
    const updateId = generateStableId({
      guid: `${update.gameId}-${update.url}`,
      link: update.url,
      title: update.title,
    });

    if (!(await isUpdateProcessed(updateId))) {
      // VERROU ANTI-SPAM : dedup cache JSON local
      if (dedupCache.isAlreadyProcessed("game_updates", updateId)) {
        logger.debug(`[SPAM BLOQUE] GameUpdates doublon cache: ${updateId}`);
        continue;
      }
      await sendUpdateNotification(client, update);
      await dedupCache.markAsProcessed("game_updates", updateId);
      await markUpdateProcessed(updateId);
    }
  }

  logger.info(`[GameUpdates] ${updates.length} mise(s) à jour vérifiée(s)`);
}

/**
 * Démarre la surveillance des mises à jour de jeux
 */
export function startGameUpdatesMonitoring(client: Client): void {
  if (updateCheckInterval) {
    logger.warn("[GameUpdates] Surveillance déjà active");
    return;
  }

  logger.info("[GameUpdates] Démarrage de la surveillance des mises à jour");

  // Vérification immédiate
  checkGameUpdates(client);

  // Vérification périodique
  updateCheckInterval = safeInterval(
    "GameUpdates",
    () => checkGameUpdates(client),
    CHECK_INTERVAL_MS,
  );
}

/**
 * Arrête la surveillance des mises à jour de jeux
 */
export function stopGameUpdatesMonitoring(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
    logger.info("[GameUpdates] Surveillance arrêtée");
  }
}
