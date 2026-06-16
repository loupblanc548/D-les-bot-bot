import { fortniteLogger } from "../utils/logger";
// Fortnite Cosmetics API Service
// Utilise fortnite-api.com/v2/cosmetics/br pour valider les noms d'items
// et récupérer les métadonnées (saison de sortie, etc.)

export interface CosmeticItem {
  id: string;
  name: string;
  description: string;
  type: {
    value: string;
    displayValue: string;
  };
  rarity: {
    value: string;
    displayValue: string;
  };
  images: {
    icon: string;
    featured: string;
  };
  introduction: {
    chapter: string;
    season: string;
  };
}

const FORTNITE_API_URL = "https://fortnite-api.com/v2/cosmetics/br";
const CACHE_DURATION = 3600000; // 1 heure en ms

let cosmeticsCache: CosmeticItem[] | null = null;
let cacheTimestamp = 0;

export async function fetchCosmetics(): Promise<CosmeticItem[]> {
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

    const data = (await response.json()) as { data?: CosmeticItem[] };
    cosmeticsCache = data.data || [];
    cacheTimestamp = now;

    fortniteLogger.info(`[FortniteCosmetics] ${cosmeticsCache.length} items récupérés`);
    return cosmeticsCache || [];
  } catch (error) {
    fortniteLogger.error("[FortniteCosmetics] Erreur:", error);
    return [];
  }
}

export async function validateCosmeticName(itemName: string): Promise<boolean> {
  const cosmetics = await fetchCosmetics();
  const normalizedInput = itemName.toLowerCase().trim();

  return cosmetics.some(
    (item) => item.name.toLowerCase() === normalizedInput
  );
}

export async function searchCosmetics(query: string, limit: number = 25): Promise<string[]> {
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

export async function getCosmeticByName(itemName: string): Promise<CosmeticItem | null> {
  const cosmetics = await fetchCosmetics();
  const normalizedInput = itemName.toLowerCase().trim();

  return (
    cosmetics.find((item) => item.name.toLowerCase() === normalizedInput) || null
  );
}

/**
 * Retourne une Map de tous les cosmétiques indexés par nom (minuscule).
 * Pratique pour le cross-reference rapide shop <-> cosmétiques.
 */
export async function getCosmeticsMap(): Promise<Map<string, CosmeticItem>> {
  const cosmetics = await fetchCosmetics();
  const map = new Map<string, CosmeticItem>();
  for (const item of cosmetics) {
    map.set(item.name.toLowerCase(), item);
  }
  return map;
}
