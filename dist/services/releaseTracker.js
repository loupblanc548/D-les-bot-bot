"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addGameRelease = addGameRelease;
exports.subscribeToRelease = subscribeToRelease;
exports.checkReleases = checkReleases;
exports.getUpcomingReleases = getUpcomingReleases;
exports.cleanupOldReleases = cleanupOldReleases;
const logger_1 = __importDefault(require("../utils/logger"));
const releases = new Map();
const subscriptions = new Map();
/**
 * Ajoute un jeu à surveiller pour sa sortie
 */
function addGameRelease(appId, gameName, platform, releaseDate, imageUrl, url) {
    const key = `${platform}:${appId}`;
    releases.set(key, {
        appId,
        gameName,
        platform,
        releaseDate,
        imageUrl,
        url: url || `https://store.steampowered.com/app/${appId}`,
        notified: false,
        addedAt: new Date()
    });
    logger_1.default.info(`[ReleaseTracker] Jeu ajouté: ${gameName} (${platform}) - ${releaseDate.toISOString()}`);
}
/**
 * S'abonne aux notifications de sortie pour un jeu
 */
function subscribeToRelease(userId, appId, platform, guildId) {
    const key = `${userId}:${appId}`;
    let subs = subscriptions.get(key) || [];
    subs.push({
        userId,
        guildId,
        appId,
        platform,
        createdAt: new Date()
    });
    subscriptions.set(key, subs);
    logger_1.default.info(`[ReleaseTracker] Abonnement ajouté pour ${userId}: ${platform} ${appId}`);
}
/**
 * Vérifie les sorties à venir et notifie si nécessaire
 */
async function checkReleases(client) {
    const now = new Date();
    const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    for (const [key, release] of releases.entries()) {
        if (release.notified)
            continue;
        // Notifier si la sortie est dans moins de 24h
        if (release.releaseDate <= oneDayLater) {
            for (const [subKey, subs] of subscriptions.entries()) {
                const [userId, appId] = subKey.split(":");
                if (appId !== release.appId)
                    continue;
                for (const sub of subs) {
                    if (sub.platform !== release.platform)
                        continue;
                    try {
                        const user = await client.users.fetch(userId);
                        const timeUntil = release.releaseDate.getTime() - now.getTime();
                        const hoursUntil = Math.floor(timeUntil / (60 * 60 * 1000));
                        let message;
                        if (timeUntil <= 0) {
                            message = `🎮 **C'est aujourd'hui !** Le jeu **${release.gameName}** sort maintenant sur ${release.platform.toUpperCase()} !`;
                        }
                        else if (hoursUntil < 24) {
                            message = `⏰ **Bientôt !** Le jeu **${release.gameName}** sort dans ${hoursUntil}h sur ${release.platform.toUpperCase()} !`;
                        }
                        else {
                            message = `📅 **Rappel !** Le jeu **${release.gameName}** sort demain sur ${release.platform.toUpperCase()} !`;
                        }
                        await user.send({
                            content: message,
                            embeds: [{
                                    color: 0x9b59b6,
                                    title: `🎮 ${release.gameName}`,
                                    description: `Date de sortie: **${release.releaseDate.toLocaleDateString("fr-FR")}**\nPlateforme: **${release.platform.toUpperCase()}**`,
                                    image: release.imageUrl ? { url: release.imageUrl } : undefined,
                                    url: release.url
                                }]
                        });
                        logger_1.default.info(`[ReleaseTracker] Notification envoyée à ${userId} pour ${release.gameName}`);
                    }
                    catch (error) {
                        logger_1.default.error(`[ReleaseTracker] Erreur notification ${userId}: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            // Marquer comme notifié
            release.notified = true;
            releases.set(key, release);
        }
    }
}
/**
 * Récupère les sorties à venir
 */
function getUpcomingReleases(days = 30) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return Array.from(releases.values())
        .filter(release => release.releaseDate >= now && release.releaseDate <= futureDate)
        .sort((a, b) => a.releaseDate.getTime() - b.releaseDate.getTime());
}
/**
 * Nettoie les anciennes sorties (plus de 7 jours après la sortie)
 */
function cleanupOldReleases() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    for (const [key, release] of releases.entries()) {
        if (release.releaseDate < sevenDaysAgo && release.notified) {
            releases.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger_1.default.info(`[ReleaseTracker] Nettoyage de ${cleaned} ancienne(s) sortie(s)`);
    }
}
// Nettoyage automatique toutes les heures
setInterval(cleanupOldReleases, 60 * 60 * 1000);
//# sourceMappingURL=releaseTracker.js.map