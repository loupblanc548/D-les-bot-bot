import logger from "../utils/logger";
import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { config } from "../config";
import prisma from "../prisma";

interface PriceAlert {
  gameId: string;
  gameName: string;
  platform: string;
  currentPrice: number;
  originalPrice: number;
  discount: number;
  url: string;
  endDate?: Date;
}

const PRICE_SOURCES = {
  steam: "https://store.steampowered.com/api/appdetails",
  instantGaming: "https://www.instant-gaming.com/en/search/",
};

const TRACKED_GAMES = [
  { id: "730", name: "Counter-Strike 2", platform: "steam" },
  { id: "1172470", name: "Apex Legends", platform: "steam" },
  { id: "578080", name: "PUBG: Battlegrounds", platform: "steam" },
];

let priceCheckInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 7200000; // 2 heures
const MIN_DISCOUNT_PERCENT = 50; // Alertes uniquement pour -50% ou plus

/**
 * Vérifie les prix sur Steam
 */
async function checkSteamPrices(): Promise<PriceAlert[]> {
  const alerts: PriceAlert[] = [];

  for (const game of TRACKED_GAMES.filter(g => g.platform === "steam")) {
    try {
      const response = await fetch(`${PRICE_SOURCES.steam}?appids=${game.id}&cc=FR`);
      const data = await response.json() as Record<string, unknown>;
      
      if (data[game.id] && (data[game.id] as Record<string, unknown>).success) {
        const appData = (data[game.id] as Record<string, unknown>).data as Record<string, unknown>;
        
        if (appData.price_overview) {
          const priceOverview = appData.price_overview as Record<string, unknown>;
          const currentPrice = (priceOverview.final as number) / 100;
          const originalPrice = (priceOverview.initial as number) / 100;
          const discount = priceOverview.discount_percent as number;

          if (discount >= MIN_DISCOUNT_PERCENT) {
            const alert: PriceAlert = {
              gameId: game.id,
              gameName: game.name,
              platform: "steam",
              currentPrice,
              originalPrice,
              discount,
              url: `https://store.steampowered.com/app/${game.id}`,
            };

            alerts.push(alert);
          }
        }
      }
    } catch (error) {
      logger.error(`[PriceAlerts] Erreur lors de la vérification des prix Steam pour ${game.name}:`, error);
    }
  }

  return alerts;
}

/**
 * Vérifie si une alerte de prix a déjà été envoyée
 */
async function isPriceAlertSent(alertId: string): Promise<boolean> {
  const existing = await prisma.processedPriceAlert.findUnique({
    where: { alertId },
  });
  return !!existing;
}

/**
 * Marque une alerte de prix comme envoyée
 */
async function markPriceAlertSent(alertId: string): Promise<void> {
  await prisma.processedPriceAlert.create({
    data: { alertId },
  });
}

/**
 * Envoie une notification de prix réduit
 */
async function sendPriceAlertNotification(client: Client, alert: PriceAlert): Promise<void> {
  if (!config.logChannel) {
    logger.error("[PriceAlerts] Channel de logs non configuré");
    return;
  }

  const channel = client.channels.cache.get(config.logChannel) as TextChannel;
  if (!channel || !channel.isTextBased()) {
    logger.error("[PriceAlerts] Channel de logs non disponible");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`💰 ${alert.gameName} - ${alert.discount}% de réduction !`)
    .setDescription(`Prix actuel : **${alert.currentPrice}€** (au lieu de ${alert.originalPrice}€)`)
    .setColor(0x00ff00)
    .addFields(
      {
        name: "Plateforme",
        value: alert.platform.toUpperCase(),
        inline: true,
      },
      {
        name: "Réduction",
        value: `-${alert.discount}%`,
        inline: true,
      },
      {
        name: "Économie",
        value: `${(alert.originalPrice - alert.currentPrice).toFixed(2)}€`,
        inline: true,
      },
    )
    .setURL(alert.url)
    .setTimestamp();

  if (alert.endDate) {
    embed.addFields({
      name: "Fin de l'offre",
      value: alert.endDate.toLocaleString(),
      inline: false,
    });
  }

  try {
    await channel.send({ embeds: [embed] });
    logger.info(`[PriceAlerts] Notification envoyée pour ${alert.gameName} (-${alert.discount}%)`);
  } catch (error) {
    logger.error("[PriceAlerts] Erreur lors de l'envoi de la notification:", error);
  }
}

/**
 * Vérifie et traite les alertes de prix
 */
export async function checkPriceAlerts(client: Client): Promise<void> {
  logger.info("[PriceAlerts] Vérification des prix réduits...");

  const alerts = await checkSteamPrices();

  for (const alert of alerts) {
    const alertId = `${alert.gameId}-${alert.currentPrice}-${alert.discount}`;
    
    if (!(await isPriceAlertSent(alertId))) {
      await sendPriceAlertNotification(client, alert);
      await markPriceAlertSent(alertId);
    }
  }

  logger.info(`[PriceAlerts] ${alerts.length} alerte(s) de prix vérifiée(s)`);
}

/**
 * Démarre la surveillance des prix
 */
export function startPriceAlertsMonitoring(client: Client): void {
  if (priceCheckInterval) {
    logger.warn("[PriceAlerts] Surveillance déjà active");
    return;
  }

  logger.info("[PriceAlerts] Démarrage de la surveillance des prix");
  
  // Vérification immédiate
  checkPriceAlerts(client);

  // Vérification périodique
  priceCheckInterval = setInterval(() => {
    checkPriceAlerts(client);
  }, CHECK_INTERVAL_MS);
}

/**
 * Arrête la surveillance des prix
 */
export function stopPriceAlertsMonitoring(): void {
  if (priceCheckInterval) {
    clearInterval(priceCheckInterval);
    priceCheckInterval = null;
    logger.info("[PriceAlerts] Surveillance arrêtée");
  }
}
