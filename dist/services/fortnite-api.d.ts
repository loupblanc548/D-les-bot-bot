import { Client } from "discord.js";
export interface ShopEntry {
    displayName: string;
    allNames: string[];
    description: string;
    type: string;
    rarity: string;
    rarityColor: number;
    price: number;
    icon: string;
    featuredImage: string | null;
    section: string;
}
export interface FortniteShopResponse {
    date: string;
    featured: ShopEntry[];
    daily: ShopEntry[];
    specialFeatured: ShopEntry[];
    specialDaily: ShopEntry[];
}
/**
 * Extrait TOUS les noms affichables d'une entrée brute de la boutique (pack + sous-articles).
 * - Récupère le nom du bundle/pack si présent (entry.bundle.name)
 * - Récupère le nom de chaque item dans entry.items (utilise displayName ou name en fallback)
 * - Retourne un tableau de noms normalisés (minuscule/trim) et uniques
 */
export declare function extractAllNamesFromEntry(entry: Record<string, unknown>): string[];
/**
 * Word-level fuzzy matching entre le nom wishlist et le nom boutique.
 * Stratégie :
 *  1. Split en mots (\W+), filtre les mots de 2+ caractères (évite "A", "I")
 *  2. Vérifie si un mot du shop est dans l'ensemble wishlist
 *  3. Fallback : boundary regex match (évite les faux positifs type "Skin" → "Skinny")
 */
export declare function matchesWishlist(wishlistName: string, shopName: string): boolean;
export declare function fetchShop(): Promise<FortniteShopResponse | null>;
export declare function checkWishlistMatches(client: Client): Promise<number>;
export declare function runWishlistRetrospective(client: Client): Promise<number>;
//# sourceMappingURL=fortnite-api.d.ts.map