/**
 * Normalise une saison saisie par l'utilisateur.
 * Retourne le format canonique (ex: "Season 3", "Chapter 2 Season 2") ou null si invalide.
 */
export declare function normalizeSeason(input: string): string | null;
/**
 * Convertit les champs chapter/season de l'API Fortnite en tag saison normalisé.
 * L'API renvoie chapter et season comme des strings (ex: "2", "3").
 */
export declare function formatApiSeason(chapter: string, season: string): string | null;
/**
 * Génère la liste de toutes les saisons valides pour l'autocomplétion.
 */
export declare function getAllValidSeasons(): string[];
/**
 * Vérifie si deux tags saison correspondent (comparaison normalisée).
 */
export declare function seasonsMatch(a: string | null, b: string | null): boolean;
/**
 * Attribue un ordre numérique à un tag saison pour permettre
 * les comparaisons de plage (ex: "Season 1" < "Season 3").
 *
 * Convention : chapter * 100 + season
 *   Season 1        → 101
 *   Season 10       → 110
 *   Chapter 2 S 1   → 201
 *   Chapter 5 S 4   → 504
 */
export declare function getSeasonNumericOrder(seasonTag: string): number;
/**
 * Parse une plage de saisons saisie par l'utilisateur.
 * Formats acceptés :
 *   - "Season 1-Season 3"
 *   - "Chapter 2 Season 1-Chapter 2 Season 8"
 *   - "Season 1-Chapter 2 Season 2" (mixte)
 *
 * Retourne { start, end } normalisés ou null si invalide.
 */
export declare function parseSeasonRange(input: string): {
    start: string;
    end: string;
} | null;
/**
 * Normalise une plage saisie et retourne le format canonique.
 * Ex: "season 1 - season 3" → "Season 1-Season 3"
 */
export declare function normalizeSeasonRange(input: string): string | null;
/**
 * Vérifie si une saison donnée se trouve dans une plage (bornes incluses).
 */
export declare function isSeasonInRange(cosmeticSeason: string, rangeStart: string, rangeEnd: string): boolean;
//# sourceMappingURL=seasons.d.ts.map