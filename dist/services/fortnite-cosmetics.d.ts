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
export declare function fetchCosmetics(): Promise<CosmeticItem[]>;
export declare function validateCosmeticName(itemName: string): Promise<boolean>;
export declare function searchCosmetics(query: string, limit?: number): Promise<string[]>;
export declare function getCosmeticByName(itemName: string): Promise<CosmeticItem | null>;
/**
 * Retourne une Map de tous les cosmétiques indexés par nom (minuscule).
 * Pratique pour le cross-reference rapide shop <-> cosmétiques.
 */
export declare function getCosmeticsMap(): Promise<Map<string, CosmeticItem>>;
//# sourceMappingURL=fortnite-cosmetics.d.ts.map