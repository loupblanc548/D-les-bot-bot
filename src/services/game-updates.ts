import logger from "../utils/logger";
import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { config } from "../config";
import prisma from "../prisma";
import Parser from "rss-parser";
import { dedupCache } from "../utils/deduplicationCache";

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
];

let updateCheckInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 3600000; // 1 heure

/**
 * Vérifie les mises à jour de jeux depuis Steam
 */
async function checkSteamUpdates(): Promise<GameUpdate[]> {
  const updates: GameUpdate[] = [];
  const parser = new Parser();

  for (const game of TRACKED_GAMES.filter(g => g.platform === "steam")) {
    try {
      const feed = await parser.parseURL(`${UPDATE_SOURCES.steam}${game.id}`);
      
      for (const item of feed.items.slice(0, 3)) {
        const title = item.title || "";
        const description = item.contentSnippet || item.content || "";
        const link = item.link || "";
        const pubDate = item.pubDate || "";

        // Vérifier si c'est une mise à jour
        if (title.toLowerCase().includes("update") || 
            title.toLowerCase().includes("patch") ||
            title.toLowerCase().includes("hotfix")) {
          
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
      logger.error(`[GameUpdates] Erreur lors de la vérification des mises à jour Steam pour ${game.name}:`, error);
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
  if (!config.logChannel) {
    logger.error("[GameUpdates] Channel de logs non configuré");
    return;
  }

  const channel = client.channels.cache.get(config.logChannel) as TextChannel;
  if (!channel || !channel.isTextBased()) {
    logger.error("[GameUpdates] Channel de logs non disponible");
    return;
  }

  const colors = {
    patch: 0x00ff00,
    maintenance: 0xffaa00,
    hotfix: 0xff6600,
    announcement: 0x00aaff,
  };

  const emojis = {
    patch: "🔧",
    maintenance: "🔨",
    hotfix: "⚡",
    announcement: "📢",
  };

  const embed = new EmbedBuilder()
    .setTitle(`${emojis[update.updateType]} ${update.gameName} - ${update.updateType.toUpperCase()}`)
    .setDescription(update.title)
    .setColor(colors[update.updateType])
    .addFields(
      {
        name: "Plateforme",
        value: update.platform.toUpperCase(),
        inline: true,
      },
      {
        name: "Type",
        value: update.updateType.toUpperCase(),
        inline: true,
      },
      {
        name: "Publié le",
        value: update.publishedAt.toLocaleString(),
        inline: true,
      },
    )
    .setURL(update.url)
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
    logger.info(`[GameUpdates] Notification envoyée pour ${update.gameName}`);
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
    const updateId = `${update.gameId}-${update.publishedAt.getTime()}`;
    
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
  updateCheckInterval = setInterval(() => {
    checkGameUpdates(client);
  }, CHECK_INTERVAL_MS);
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
