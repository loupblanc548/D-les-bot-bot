// Utilitaire de normalisation des saisons Fortnite
// Format reconnus :
//   - "Season 1" .. "Season X" (Chapitre 1, format historique)
//   - "Chapter N Season M" (Chapitres 2+)
//   - "Saison X" / "Chapitre N Saison M" (français)
const SEASON_REGEX = /^(?:saison|season)\s*(\d+)$/i;
const CHAPTER_SEASON_REGEX = /^(?:chapitre|chapter)\s*(\d+)\s*(?:saison|season)\s*(\d+)$/i;
// Maximums connus (approximatifs, pour validation)
const CHAPTER_MAX_SEASONS = {
    1: 10, // Chapter 1: Season 1-10 (X)
    2: 8, // Chapter 2: Season 1-8
    3: 4, // Chapter 3: Season 1-4
    4: 4, // Chapter 4: Season 1-4
    5: 4, // Chapter 5: Season 1-4
    6: 2, // Chapter 6: Season 1-2
};
/**
 * Normalise une saison saisie par l'utilisateur.
 * Retourne le format canonique (ex: "Season 3", "Chapter 2 Season 2") ou null si invalide.
 */
export function normalizeSeason(input) {
    const trimmed = input.trim();
    // Essayer le format "Chapter N Season M" / "Chapitre N Saison M"
    const chapterMatch = trimmed.match(CHAPTER_SEASON_REGEX);
    if (chapterMatch) {
        const chapter = parseInt(chapterMatch[1], 10);
        const season = parseInt(chapterMatch[2], 10);
        const maxSeason = CHAPTER_MAX_SEASONS[chapter];
        if (maxSeason && season >= 1 && season <= maxSeason) {
            if (chapter === 1) {
                return `Season ${season}`;
            }
            return `Chapter ${chapter} Season ${season}`;
        }
        return null;
    }
    // Essayer le format "Season X" / "Saison X"
    const seasonMatch = trimmed.match(SEASON_REGEX);
    if (seasonMatch) {
        const season = parseInt(seasonMatch[1], 10);
        const maxSeason = CHAPTER_MAX_SEASONS[1] || 10;
        if (season >= 1 && season <= maxSeason) {
            return `Season ${season}`;
        }
        return null;
    }
    return null;
}
/**
 * Convertit les champs chapter/season de l'API Fortnite en tag saison normalisé.
 * L'API renvoie chapter et season comme des strings (ex: "2", "3").
 */
export function formatApiSeason(chapter, season) {
    const ch = parseInt(chapter, 10);
    const se = parseInt(season, 10);
    if (isNaN(ch) || isNaN(se))
        return null;
    if (ch === 1) {
        return `Season ${se}`;
    }
    return `Chapter ${ch} Season ${se}`;
}
/**
 * Génère la liste de toutes les saisons valides pour l'autocomplétion.
 */
export function getAllValidSeasons() {
    const seasons = [];
    for (const [chapter, maxSeason] of Object.entries(CHAPTER_MAX_SEASONS)) {
        const ch = parseInt(chapter, 10);
        for (let s = 1; s <= maxSeason; s++) {
            if (ch === 1) {
                seasons.push(`Season ${s}`);
            }
            else {
                seasons.push(`Chapter ${ch} Season ${s}`);
            }
        }
    }
    return seasons;
}
/**
 * Vérifie si deux tags saison correspondent (comparaison normalisée).
 */
export function seasonsMatch(a, b) {
    if (!a || !b)
        return false;
    return a.toLowerCase() === b.toLowerCase();
}
// ── Plages / Périodes ────────────────────────────────────────────────────────
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
export function getSeasonNumericOrder(seasonTag) {
    const normalized = normalizeSeason(seasonTag);
    if (!normalized)
        return -1;
    const chapterRegEx = /^(?:chapitre|chapter)\s*(\d+)\s*(?:saison|season)\s*(\d+)$/i;
    const chapterMatch = normalized.match(chapterRegEx);
    if (chapterMatch) {
        return parseInt(chapterMatch[1], 10) * 100 + parseInt(chapterMatch[2], 10);
    }
    // Format "Season N" → Chapter 1
    const seasonRegEx = /^(?:saison|season)\s*(\d+)$/i;
    const seasonMatch = normalized.match(seasonRegEx);
    if (seasonMatch) {
        return 100 + parseInt(seasonMatch[1], 10);
    }
    return -1;
}
/**
 * Parse une plage de saisons saisie par l'utilisateur.
 * Formats acceptés :
 *   - "Season 1-Season 3"
 *   - "Chapter 2 Season 1-Chapter 2 Season 8"
 *   - "Season 1-Chapter 2 Season 2" (mixte)
 *
 * Retourne { start, end } normalisés ou null si invalide.
 */
export function parseSeasonRange(input) {
    const trimmed = input.trim();
    // Chercher un séparateur de plage : tiret, tiret cadratin, "à", "to", "->"
    const sepMatch = trimmed.match(/^(.*?)\s*[-–—→]+\s*(.+)$/)
        || trimmed.match(/^(.*?)\s+(?:à|to)\s+(.+)$/i);
    if (!sepMatch)
        return null;
    const startTag = normalizeSeason(sepMatch[1].trim());
    const endTag = normalizeSeason(sepMatch[2].trim());
    if (!startTag || !endTag)
        return null;
    const startOrder = getSeasonNumericOrder(startTag);
    const endOrder = getSeasonNumericOrder(endTag);
    if (startOrder < 0 || endOrder < 0 || startOrder > endOrder)
        return null;
    return { start: startTag, end: endTag };
}
/**
 * Normalise une plage saisie et retourne le format canonique.
 * Ex: "season 1 - season 3" → "Season 1-Season 3"
 */
export function normalizeSeasonRange(input) {
    const parsed = parseSeasonRange(input);
    if (!parsed)
        return null;
    return parsed.start + "-" + parsed.end;
}
/**
 * Vérifie si une saison donnée se trouve dans une plage (bornes incluses).
 */
export function isSeasonInRange(cosmeticSeason, rangeStart, rangeEnd) {
    const cosmeticOrder = getSeasonNumericOrder(cosmeticSeason);
    const startOrder = getSeasonNumericOrder(rangeStart);
    const endOrder = getSeasonNumericOrder(rangeEnd);
    if (cosmeticOrder < 0 || startOrder < 0 || endOrder < 0)
        return false;
    return cosmeticOrder >= startOrder && cosmeticOrder <= endOrder;
}
//# sourceMappingURL=seasons.js.map