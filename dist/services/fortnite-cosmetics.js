"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCosmetics = fetchCosmetics;
exports.validateCosmeticName = validateCosmeticName;
exports.searchCosmetics = searchCosmetics;
exports.getCosmeticByName = getCosmeticByName;
exports.getCosmeticsMap = getCosmeticsMap;
const logger_1 = require("../utils/logger");
const FORTNITE_API_URL = "https://fortnite-api.com/v2/cosmetics/br";
const CACHE_DURATION = 3600000; // 1 heure en ms
let cosmeticsCache = null;
let cacheTimestamp = 0;
async function fetchCosmetics() {
    const now = Date.now();
    // Retourner le cache si valide
    if (cosmeticsCache && now - cacheTimestamp < CACHE_DURATION) {
        return cosmeticsCache;
    }
    try {
        const response = await fetch(FORTNITE_API_URL);
        if (!response.ok) {
            logger_1.fortniteLogger.warn("[FortniteCosmetics] HTTP", response.status);
            return [];
        }
        const data = (await response.json());
        cosmeticsCache = data.data || [];
        cacheTimestamp = now;
        logger_1.fortniteLogger.info(`[FortniteCosmetics] ${cosmeticsCache.length} items récupérés`);
        return cosmeticsCache || [];
    }
    catch (error) {
        logger_1.fortniteLogger.error("[FortniteCosmetics] Erreur:", error);
        return [];
    }
}
async function validateCosmeticName(itemName) {
    const cosmetics = await fetchCosmetics();
    const normalizedInput = itemName.toLowerCase().trim();
    return cosmetics.some((item) => item.name.toLowerCase() === normalizedInput);
}
async function searchCosmetics(query, limit = 25) {
    const cosmetics = await fetchCosmetics();
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
        return [];
    }
    const matches = cosmetics
        .filter((item) => item.name.toLowerCase().includes(normalizedQuery))
        .slice(0, limit)
        .map((item) => item.name);
    return matches;
}
async function getCosmeticByName(itemName) {
    const cosmetics = await fetchCosmetics();
    const normalizedInput = itemName.toLowerCase().trim();
    return (cosmetics.find((item) => item.name.toLowerCase() === normalizedInput) || null);
}
/**
 * Retourne une Map de tous les cosmétiques indexés par nom (minuscule).
 * Pratique pour le cross-reference rapide shop <-> cosmétiques.
 */
async function getCosmeticsMap() {
    const cosmetics = await fetchCosmetics();
    const map = new Map();
    for (const item of cosmetics) {
        map.set(item.name.toLowerCase(), item);
    }
    return map;
}
//# sourceMappingURL=fortnite-cosmetics.js.map