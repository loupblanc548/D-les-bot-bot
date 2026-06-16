"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticatePsn = authenticatePsn;
exports.getPsnProfile = getPsnProfile;
exports.getPsnRecentGames = getPsnRecentGames;
exports.getPsnDeals = getPsnDeals;
exports.isValidPsnId = isValidPsnId;
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const psn_api_1 = require("psn-api");
let cachedAuth = null;
let authPromise = null;
async function authenticatePsn() {
    const now = Date.now();
    if (cachedAuth && now < cachedAuth.expiresAt - 60_000) {
        return cachedAuth.accessToken;
    }
    if (authPromise)
        return authPromise;
    const npsso = config_1.config.psnNpssoToken;
    if (!npsso)
        throw new Error("PSN_NPSSO_TOKEN manquant dans .env");
    authPromise = (async () => {
        try {
            const accessCode = await (0, psn_api_1.exchangeNpssoForCode)(npsso);
            const authorization = await (0, psn_api_1.exchangeCodeForAccessToken)(accessCode);
            cachedAuth = {
                accessToken: authorization.accessToken,
                expiresAt: now + (authorization.expiresIn ?? 3600) * 1000,
            };
            logger_1.default.info("[PSN] Authentification reussie");
            return authorization.accessToken;
        }
        catch (error) {
            logger_1.default.error("[PSN] Erreur d authentification:", String(error));
            throw new Error("Echec authentification PSN. Verifie ton token NPSSO.");
        }
        finally {
            authPromise = null;
        }
    })();
    return authPromise;
}
async function getPsnProfile(username) {
    try {
        const accessToken = await authenticatePsn();
        const result = await (0, psn_api_1.getProfileFromUserName)({ accessToken }, username);
        const p = result.profile;
        const accountId = p.accountId;
        let trophySummary = {
            level: 0, progress: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, total: 0,
        };
        if (accountId) {
            try {
                const td = await (0, psn_api_1.getUserTrophyProfileSummary)({ accessToken }, accountId);
                trophySummary = {
                    level: Number(td.trophyLevel) || 0,
                    progress: Number(td.progress) || 0,
                    platinum: td.earnedTrophies?.platinum || 0,
                    gold: td.earnedTrophies?.gold || 0,
                    silver: td.earnedTrophies?.silver || 0,
                    bronze: td.earnedTrophies?.bronze || 0,
                    total: Object.values(td.earnedTrophies || {}).reduce((a, b) => a + b, 0),
                };
            }
            catch (trophyErr) {
                logger_1.default.warn(`[PSN] Trophees indisponibles pour "${username}":`, String(trophyErr));
            }
        }
        return {
            onlineId: p.onlineId,
            accountId,
            avatarUrl: p.avatarUrls?.[0]?.avatarUrl || "",
            aboutMe: p.aboutMe || "",
            plusTier: p.plus || 0,
            trophySummary,
        };
    }
    catch (error) {
        logger_1.default.error(`[PSN] Erreur profil "${username}":`, String(error));
        return null;
    }
}
async function getPsnRecentGames(accountIdOrUsername, limit = 10) {
    try {
        const accessToken = await authenticatePsn();
        // Si c'est un username, on résout d'abord en accountId
        let accountId = accountIdOrUsername;
        if (!/^\d+$/.test(accountIdOrUsername)) {
            const profile = await getPsnProfile(accountIdOrUsername);
            if (!profile)
                return [];
            accountId = profile.accountId;
            if (!accountId)
                return [];
        }
        const response = await (0, psn_api_1.getUserTitles)({ accessToken }, accountId, { limit });
        return (response.trophyTitles || []).map((t) => ({
            npCommunicationId: t.npCommunicationId,
            titleName: t.trophyTitleName || t.titleName || "Inconnu",
            platform: t.trophyTitlePlatform || "PS4/PS5",
            imageUrl: t.trophyTitleIconUrl || "",
            trophyCount: {
                platinum: t.earnedTrophies?.platinum || 0,
                gold: t.earnedTrophies?.gold || 0,
                silver: t.earnedTrophies?.silver || 0,
                bronze: t.earnedTrophies?.bronze || 0,
            },
            progress: t.progress || 0,
            lastPlayedAt: t.lastUpdatedDateTime || undefined,
        }));
    }
    catch (error) {
        logger_1.default.error(`[PSN] Erreur jeux "${accountIdOrUsername}":`, String(error));
        return [];
    }
}
/**
 * Scrape les deals PlayStation depuis psprices.com.
 * Approche similaire a instantgaming.ts.
 */
async function getPsnDeals(limit = 5) {
    try {
        const url = "https://psprices.com/region-fr/discounts/?platform=PS4&sort=date";
        const response = await fetch(url, {
            headers: {
                "User-Agent": "DiscordSurveillanceBot/1.0",
                "Accept": "text/html",
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
            return [];
        const html = await response.text();
        // Extraction basique des deals via regex sur les data attributes
        const deals = [];
        const gameRegex = /<div[^>]*class="[^"]*game-row[^"]*"[^>]*data-name="([^"]*)"[^>]*data-price="([^"]*)"[^>]*data-cut="([^"]*)"[^>]*data-end="([^"]*)"[^>]*>/g;
        let match;
        while ((match = gameRegex.exec(html)) !== null && deals.length < limit) {
            const [, title, discountedPrice, discountPercent, endDate] = match;
            const originalPrice = String(Math.round(Number(discountedPrice) / (1 - Number(discountPercent) / 100) * 100) / 100);
            deals.push({
                title: title.replace(/&amp;/g, "&").replace(/&quot;/g, "\""),
                originalPrice: `${originalPrice}€`,
                discountedPrice: `${discountedPrice}€`,
                discountPercent: Number(discountPercent),
                endDate: endDate || "Inconnue",
                url: `https://psprices.com/region-fr/search/?q=${encodeURIComponent(title)}`,
                imageUrl: "",
            });
        }
        return deals;
    }
    catch (error) {
        logger_1.default.error("[PSN] Erreur deals:", String(error));
        return [];
    }
}
function isValidPsnId(id) {
    return /^[a-zA-Z0-9_-]{3,16}$/.test(id);
}
//# sourceMappingURL=psn.js.map