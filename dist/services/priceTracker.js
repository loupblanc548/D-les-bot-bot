"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGamePrice = getGamePrice;
exports.addPriceAlert = addPriceAlert;
exports.checkPriceAlerts = checkPriceAlerts;
exports.cleanupOldAlerts = cleanupOldAlerts;
const logger_1 = __importDefault(require("../utils/logger"));
const priceCache = new Map();
const priceAlerts = new Map();
/**
 * Récupère le prix d'un jeu sur Steam
 */
async function getSteamPrice(appId) {
    try {
        const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=FR`, {
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            throw new Error(`Steam API error: ${response.status}`);
        }
        const data = await response.json();
        const appData = data[appId];
        if (!appData || !appData.success) {
            return null;
        }
        const priceData = appData.data.price_overview;
        if (!priceData) {
            // Jeu gratuit ou prix non disponible
            return {
                appId,
                platform: "steam",
                gameName: appData.data.name,
                currentPrice: 0,
                originalPrice: 0,
                discount: 0,
                currency: "EUR",
                url: `https://store.steampowered.com/app/${appId}`,
                imageUrl: appData.data.header_image,
                lastChecked: Date.now()
            };
        }
        return {
            appId,
            platform: "steam",
            gameName: appData.data.name,
            currentPrice: priceData.final / 100,
            originalPrice: priceData.initial / 100,
            discount: priceData.discount_percent,
            currency: priceData.currency,
            url: `https://store.steampowered.com/app/${appId}`,
            imageUrl: appData.data.header_image,
            lastChecked: Date.now()
        };
    }
    catch (error) {
        logger_1.default.error(`[PriceTracker] Erreur récupération prix Steam ${appId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
/**
 * Récupère le prix d'un jeu sur Epic Games Store
 */
async function getEpicPrice(appId) {
    try {
        // Epic Games Store API n'est pas publique, utiliser une alternative
        // Pour l'instant, retourner null (nécessiterait scraping ou API tierce)
        logger_1.default.warn(`[PriceTracker] Epic Games Store API non disponible pour ${appId}`);
        return null;
    }
    catch (error) {
        logger_1.default.error(`[PriceTracker] Erreur récupération prix Epic ${appId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
/**
 * Récupère le prix d'un jeu sur PlayStation Store
 */
async function getPSNPrice(appId) {
    try {
        // PlayStation Store API nécessite authentification
        // Pour l'instant, retourner null (nécessiterait scraping ou API tierce)
        logger_1.default.warn(`[PriceTracker] PlayStation Store API non disponible pour ${appId}`);
        return null;
    }
    catch (error) {
        logger_1.default.error(`[PriceTracker] Erreur récupération prix PSN ${appId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
/**
 * Récupère le prix d'un jeu sur une plateforme spécifique
 */
async function getGamePrice(appId, platform) {
    const cacheKey = `${platform}:${appId}`;
    const cached = priceCache.get(cacheKey);
    // Si le cache a moins de 1 heure, l'utiliser
    if (cached && Date.now() - cached.lastChecked < 60 * 60 * 1000) {
        return cached;
    }
    let price = null;
    switch (platform) {
        case "steam":
            price = await getSteamPrice(appId);
            break;
        case "epic":
            price = await getEpicPrice(appId);
            break;
        case "psn":
            price = await getPSNPrice(appId);
            break;
    }
    if (price) {
        priceCache.set(cacheKey, price);
    }
    return price;
}
/**
 * Ajoute une alerte de prix pour un utilisateur
 */
function addPriceAlert(userId, appId, platform, targetPrice, guildId) {
    const key = `${userId}:${appId}`;
    let alerts = priceAlerts.get(key) || [];
    alerts.push({
        userId,
        guildId,
        appId,
        platform,
        targetPrice,
        createdAt: Date.now()
    });
    priceAlerts.set(key, alerts);
    logger_1.default.info(`[PriceTracker] Alerte ajoutée pour ${userId}: ${platform} ${appId} à ${targetPrice}€`);
}
/**
 * Vérifie les alertes de prix et notifie si le prix cible est atteint
 */
async function checkPriceAlerts(client) {
    for (const [key, alerts] of priceAlerts.entries()) {
        const [userId, appId] = key.split(":");
        const platform = alerts[0].platform;
        const price = await getGamePrice(appId, platform);
        if (!price)
            continue;
        for (const alert of alerts) {
            if (price.currentPrice <= alert.targetPrice) {
                // Notifier l'utilisateur
                try {
                    const user = await client.users.fetch(userId);
                    await user.send({
                        content: `🎉 **Bonne nouvelle !** Le jeu **${price.gameName}** est maintenant à **${price.currentPrice}€** sur ${platform.toUpperCase()} !\n\n🔗 ${price.url}`,
                        embeds: [{
                                color: 0x00ff00,
                                title: `🎮 ${price.gameName}`,
                                description: `Prix actuel: **${price.currentPrice}€** (au lieu de ${price.originalPrice}€)\nRemise: **${price.discount}%**`,
                                image: { url: price.imageUrl },
                                url: price.url
                            }]
                    });
                    logger_1.default.info(`[PriceTracker] Notification envoyée à ${userId} pour ${price.gameName}`);
                }
                catch (error) {
                    logger_1.default.error(`[PriceTracker] Erreur notification ${userId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
    }
}
/**
 * Nettoie les anciennes alertes (plus de 30 jours)
 */
function cleanupOldAlerts() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let cleaned = 0;
    for (const [key, alerts] of priceAlerts.entries()) {
        const filtered = alerts.filter(alert => alert.createdAt > thirtyDaysAgo);
        if (filtered.length !== alerts.length) {
            if (filtered.length === 0) {
                priceAlerts.delete(key);
            }
            else {
                priceAlerts.set(key, filtered);
            }
            cleaned += alerts.length - filtered.length;
        }
    }
    if (cleaned > 0) {
        logger_1.default.info(`[PriceTracker] Nettoyage de ${cleaned} ancienne(s) alerte(s)`);
    }
}
// Nettoyage automatique toutes les heures
setInterval(cleanupOldAlerts, 60 * 60 * 1000);
//# sourceMappingURL=priceTracker.js.map