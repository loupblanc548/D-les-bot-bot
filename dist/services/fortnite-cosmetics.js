import { fortniteLogger } from "../utils/logger.js";
const FORTNITE_API_URL = "https://fortnite-api.com/v2/cosmetics/br";
const CACHE_DURATION = 3600000; // 1 heure en ms
let cosmeticsCache = null;
let cacheTimestamp = 0;
export async function fetchCosmetics() {
    const now = Date.now();
    // Retourner le cache si valide
    if (cosmeticsCache && now - cacheTimestamp < CACHE_DURATION) {
        return cosmeticsCache;
    }
    try {
        const response = await fetch(FORTNITE_API_URL);
        if (!response.ok) {
            fortniteLogger.warn("[FortniteCosmetics] HTTP", response.status);
            return [];
        }
        const data = (await response.json());
        cosmeticsCache = data.data || [];
        cacheTimestamp = now;
        fortniteLogger.info(`[FortniteCosmetics] ${cosmeticsCache.length} items récupérés`);
        return cosmeticsCache || [];
    }
    catch (error) {
        fortniteLogger.error("[FortniteCosmetics] Erreur:", error);
        return [];
    }
}
export async function validateCosmeticName(itemName) {
    const cosmetics = await fetchCosmetics();
    const normalizedInput = itemName.toLowerCase().trim();
    return cosmetics.some((item) => item.name.toLowerCase() === normalizedInput);
}
export async function searchCosmetics(query, limit = 25) {
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
export async function getCosmeticByName(itemName) {
    const cosmetics = await fetchCosmetics();
    const normalizedInput = itemName.toLowerCase().trim();
    return (cosmetics.find((item) => item.name.toLowerCase() === normalizedInput) || null);
}
/**
 * Retourne une Map de tous les cosmétiques indexés par nom (minuscule).
 * Pratique pour le cross-reference rapide shop <-> cosmétiques.
 */
export async function getCosmeticsMap() {
    const cosmetics = await fetchCosmetics();
    const map = new Map();
    for (const item of cosmetics) {
        map.set(item.name.toLowerCase(), item);
    }
    return map;
}
//# sourceMappingURL=fortnite-cosmetics.js.map