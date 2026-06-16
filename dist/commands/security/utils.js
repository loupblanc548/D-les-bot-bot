"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSuspiciousLinks = checkSuspiciousLinks;
exports.checkSuspiciousLinksDetailed = checkSuspiciousLinksDetailed;
exports.isAntiPhishingActive = isAntiPhishingActive;
exports.isAntiRaidActive = isAntiRaidActive;
const prisma_1 = __importDefault(require("../../prisma"));
// ===== Constantes de détection de liens suspects =====
const SUSPICIOUS_TLDS = new Set([
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "click", "download",
    "work", "review", "country", "science", "party", "gdn", "stream",
]);
const SUSPICIOUS_PATTERNS = [
    /discord-?nitro/i,
    /free-?nitro/i,
    /airdrop/i,
    /@everyone/i,
    /steam-?community/i,
    /discord-?gift/i,
    /verify-?your-?account/i,
    /steal/i,
];
const URL_SHORTENERS = new Set([
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd",
    "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy",
]);
/**
 * Vérifie rapidement si une chaîne contient des liens suspects.
 * (Utilisé par l'event messages pour le filtrage temps réel)
 */
function checkSuspiciousLinks(content) {
    return checkSuspiciousLinksDetailed(content).length > 0;
}
/**
 * Variante détaillée qui retourne la liste des flags détectés.
 * (Utilisé par la commande /linkcheck pour afficher un rapport)
 */
function checkSuspiciousLinksDetailed(content) {
    const flags = [];
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    const urls = content.match(urlRegex) || [];
    for (const url of urls) {
        let host = "";
        try {
            host = new URL(url).hostname.toLowerCase();
        }
        catch {
            flags.push("URL malformée");
            continue;
        }
        // IP directe
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
            flags.push("IP directe : " + host);
            continue;
        }
        // TLD suspect
        const tld = host.split(".").pop() || "";
        if (SUSPICIOUS_TLDS.has(tld)) {
            flags.push("TLD suspect : ." + tld);
        }
        // Raccourcisseur d'URL
        if (URL_SHORTENERS.has(host)) {
            flags.push("Raccourcisseur d'URL : " + host);
        }
        // Motifs de phishing
        for (const pattern of SUSPICIOUS_PATTERNS) {
            if (pattern.test(content) || pattern.test(url)) {
                flags.push("Motif suspect : " + pattern.source);
            }
        }
    }
    return flags;
}
/** Vérifie si l'anti-phishing est activé pour une guilde (avec cache). */
async function isAntiPhishingActive(guildId) {
    const cached = cache_2.antiPhishingCache.get(guildId);
    if (cached && Date.now() - cached.cachedAt < cache_2.ANTI_PHISHING_CACHE_TTL_MS) {
        return cached.active;
    }
    try {
        const cfg = await prisma_1.default.guildConfig.findUnique({ where: { guildId } });
        const active = cfg?.antiPhishing ?? false;
        cache_2.antiPhishingCache.set(guildId, { active, cachedAt: Date.now() });
        return active;
    }
    catch {
        return false;
    }
}
/** Vérifie si l'anti-raid est activé pour une guilde (avec cache). */
async function isAntiRaidActive(guildId) {
    const cached = cache_1.antiRaidCache.get(guildId);
    if (cached && Date.now() - cached.cachedAt < cache_1.ANTI_RAID_CACHE_TTL_MS) {
        return { active: cached.active, seuilHeures: cached.seuilHeures };
    }
    try {
        const cfg = await prisma_1.default.guildConfig.findUnique({ where: { guildId } });
        const active = cfg?.antiRaidEnabled ?? false;
        const seuilHeures = cfg?.antiRaidSeuilHeures ?? 24;
        cache_1.antiRaidCache.set(guildId, { active, seuilHeures, cachedAt: Date.now() });
        return { active, seuilHeures };
    }
    catch {
        return { active: false, seuilHeures: 24 };
    }
}
// Réimports des caches et constantes pour les helpers isActive
const cache_1 = require("./cache");
const cache_2 = require("./cache");
//# sourceMappingURL=utils.js.map