"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const seasons_1 = require("./seasons");
// Helpers existants
(0, vitest_1.describe)("normalizeSeason", () => {
    (0, vitest_1.it)("normalise un format anglais simple", () => {
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Season 1")).toBe("Season 1");
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Season 10")).toBe("Season 10");
    });
    (0, vitest_1.it)("normalise un format français simple", () => {
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Saison 3")).toBe("Season 3");
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Saison 7")).toBe("Season 7");
    });
    (0, vitest_1.it)("normalise un format chapitre anglais", () => {
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Chapter 2 Season 1")).toBe("Chapter 2 Season 1");
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Chapter 5 Season 4")).toBe("Chapter 5 Season 4");
    });
    (0, vitest_1.it)("normalise un format chapitre français", () => {
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Chapitre 3 Saison 2")).toBe("Chapter 3 Season 2");
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Chapitre 6 Saison 1")).toBe("Chapter 6 Season 1");
    });
    (0, vitest_1.it)("rejette une saison inexistante", () => {
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Season 99")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Chapter 2 Season 99")).toBeNull();
    });
    (0, vitest_1.it)("rejette un format invalide", () => {
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("truc")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.normalizeSeason)("Chapter X Season 1")).toBeNull();
    });
});
(0, vitest_1.describe)("seasonsMatch", () => {
    (0, vitest_1.it)("match deux saisons identiques", () => {
        (0, vitest_1.expect)((0, seasons_1.seasonsMatch)("Season 1", "Season 1")).toBe(true);
    });
    (0, vitest_1.it)("match indépendamment de la casse", () => {
        (0, vitest_1.expect)((0, seasons_1.seasonsMatch)("Season 1", "season 1")).toBe(true);
        (0, vitest_1.expect)((0, seasons_1.seasonsMatch)("CHAPTER 2 SEASON 3", "chapter 2 season 3")).toBe(true);
    });
    (0, vitest_1.it)("ne match pas des saisons différentes", () => {
        (0, vitest_1.expect)((0, seasons_1.seasonsMatch)("Season 1", "Season 2")).toBe(false);
    });
    (0, vitest_1.it)("rejette les null", () => {
        (0, vitest_1.expect)((0, seasons_1.seasonsMatch)(null, "Season 1")).toBe(false);
        (0, vitest_1.expect)((0, seasons_1.seasonsMatch)("Season 1", null)).toBe(false);
        (0, vitest_1.expect)((0, seasons_1.seasonsMatch)(null, null)).toBe(false);
    });
});
(0, vitest_1.describe)("getSeasonNumericOrder", () => {
    (0, vitest_1.it)("calcule l'ordre pour Season", () => {
        (0, vitest_1.expect)((0, seasons_1.getSeasonNumericOrder)("Season 1")).toBe(101);
        (0, vitest_1.expect)((0, seasons_1.getSeasonNumericOrder)("Season 10")).toBe(110);
    });
    (0, vitest_1.it)("calcule l'ordre pour Chapter", () => {
        (0, vitest_1.expect)((0, seasons_1.getSeasonNumericOrder)("Chapter 2 Season 1")).toBe(201);
        (0, vitest_1.expect)((0, seasons_1.getSeasonNumericOrder)("Chapter 2 Season 8")).toBe(208);
        (0, vitest_1.expect)((0, seasons_1.getSeasonNumericOrder)("Chapter 5 Season 4")).toBe(504);
        (0, vitest_1.expect)((0, seasons_1.getSeasonNumericOrder)("Chapter 6 Season 2")).toBe(602);
    });
    (0, vitest_1.it)("retourne -1 pour une saison invalide", () => {
        (0, vitest_1.expect)((0, seasons_1.getSeasonNumericOrder)("Season 99")).toBe(-1);
        (0, vitest_1.expect)((0, seasons_1.getSeasonNumericOrder)("truc")).toBe(-1);
    });
    (0, vitest_1.it)("conserve l'ordre chronologique", () => {
        const s1 = (0, seasons_1.getSeasonNumericOrder)("Season 1");
        const s5 = (0, seasons_1.getSeasonNumericOrder)("Season 5");
        const c2s1 = (0, seasons_1.getSeasonNumericOrder)("Chapter 2 Season 1");
        const c5s4 = (0, seasons_1.getSeasonNumericOrder)("Chapter 5 Season 4");
        (0, vitest_1.expect)(s1).toBeLessThan(s5);
        (0, vitest_1.expect)(s5).toBeLessThan(c2s1);
        (0, vitest_1.expect)(c2s1).toBeLessThan(c5s4);
    });
});
(0, vitest_1.describe)("getAllValidSeasons", () => {
    (0, vitest_1.it)("retourne un tableau non vide", () => {
        const seasons = (0, seasons_1.getAllValidSeasons)();
        (0, vitest_1.expect)(seasons.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(seasons).toContain("Season 1");
        (0, vitest_1.expect)(seasons).toContain("Chapter 2 Season 1");
    });
    (0, vitest_1.it)("contient tous les chapitres connus", () => {
        const seasons = (0, seasons_1.getAllValidSeasons)();
        (0, vitest_1.expect)(seasons).toContain("Season 10"); // Chapter 1 max
        (0, vitest_1.expect)(seasons).toContain("Chapter 2 Season 8");
        (0, vitest_1.expect)(seasons).toContain("Chapter 3 Season 4");
        (0, vitest_1.expect)(seasons).toContain("Chapter 4 Season 4");
        (0, vitest_1.expect)(seasons).toContain("Chapter 5 Season 4");
        (0, vitest_1.expect)(seasons).toContain("Chapter 6 Season 2");
    });
});
// ── parseSeasonRange ─────────────────────────────────────────────────────────
(0, vitest_1.describe)("parseSeasonRange", () => {
    // ✅ Cas valides — séparateur tiret
    (0, vitest_1.it)("parse une plage simple avec tiret", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 1-Season 3");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Season 3");
    });
    (0, vitest_1.it)("parse une plage avec Chapter", () => {
        const result = (0, seasons_1.parseSeasonRange)("Chapter 2 Season 1-Chapter 2 Season 8");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Chapter 2 Season 1");
        (0, vitest_1.expect)(result.end).toBe("Chapter 2 Season 8");
    });
    (0, vitest_1.it)("parse une plage mixte (Season → Chapter)", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 1-Chapter 2 Season 2");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Chapter 2 Season 2");
    });
    (0, vitest_1.it)("parse une plage en français", () => {
        const result = (0, seasons_1.parseSeasonRange)("Saison 1-Saison 5");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Season 5");
    });
    (0, vitest_1.it)("parse une plage avec 'à'", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 1 à Season 4");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Season 4");
    });
    (0, vitest_1.it)("parse une plage avec 'to'", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 2 to Season 6");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 2");
        (0, vitest_1.expect)(result.end).toBe("Season 6");
    });
    (0, vitest_1.it)("parse avec tiret cadratin (—)", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 1 — Season 3");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Season 3");
    });
    (0, vitest_1.it)("parse avec tiret demi-cadratin (–)", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 1 – Season 3");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Season 3");
    });
    (0, vitest_1.it)("parse avec flèche (→)", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 1 → Season 4");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Season 4");
    });
    (0, vitest_1.it)("parse même avec des espaces superflus", () => {
        const result = (0, seasons_1.parseSeasonRange)("  Season 1   -   Season 3  ");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Season 3");
    });
    (0, vitest_1.it)("parse une plage qui commence et finit par la même saison", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 3-Season 3");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 3");
        (0, vitest_1.expect)(result.end).toBe("Season 3");
    });
    (0, vitest_1.it)("parse sans espace autour du tiret", () => {
        const result = (0, seasons_1.parseSeasonRange)("Season 1-Season 2");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Season 2");
    });
    (0, vitest_1.it)("parse avec majuscules mélangées", () => {
        const result = (0, seasons_1.parseSeasonRange)("season 1 - CHAPTER 2 SEASON 3");
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.start).toBe("Season 1");
        (0, vitest_1.expect)(result.end).toBe("Chapter 2 Season 3");
    });
    (0, vitest_1.it)("parse Chapter 1 Season X (format historique)", () => {
        const result = (0, seasons_1.parseSeasonRange)("Chapter 1 Season 2-Chapter 1 Season 5");
        (0, vitest_1.expect)(result).not.toBeNull();
        // Chapter 1 est normalisé sans le numéro de chapitre
        (0, vitest_1.expect)(result.start).toBe("Season 2");
        (0, vitest_1.expect)(result.end).toBe("Season 5");
    });
    // ❌ Cas invalides
    (0, vitest_1.it)("rejette si start > end", () => {
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Season 5-Season 1")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Chapter 3 Season 2-Chapter 2 Season 5")).toBeNull();
    });
    (0, vitest_1.it)("rejette sans séparateur", () => {
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Season 1")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Chapter 2 Season 3")).toBeNull();
    });
    (0, vitest_1.it)("rejette une saison invalide dans la plage", () => {
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Season 1-Season 99")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Season 99-Season 100")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Chapter 2 Season 99-Chapter 3 Season 1")).toBeNull();
    });
    (0, vitest_1.it)("rejette une entrée vide", () => {
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("   ")).toBeNull();
    });
    (0, vitest_1.it)("rejette du texte arbitraire", () => {
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("blabla")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("truc - machin")).toBeNull();
    });
    (0, vitest_1.it)("rejette un seul côté valide", () => {
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Season 1 - blabla")).toBeNull();
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("blabla - Season 5")).toBeNull();
    });
    (0, vitest_1.it)("rejette un séparateur 'to/'à' collé sans espaces (mot dans le texte)", () => {
        // "Season 1to Season 5" → "to" fait partie du mot, pas de séparateur reconnu
        // La regex attend un espace avant "to"/"à"
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Season 1to Season 5")).toBeNull();
    });
    (0, vitest_1.it)("rejette une plage avec 3 saisons (plus d'un séparateur)", () => {
        // Le premier groupe capture tout avant le premier tiret, le 2e tout après le dernier
        // "Season 1-Season 2-Season 3" → start="Season 1", end="Season 2-Season 3"
        // "Season 2-Season 3" n'est pas normalisable → null
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Season 1-Season 2-Season 3")).toBeNull();
    });
    (0, vitest_1.it)("rejette une plage avec un chapitre invalide", () => {
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Chapter 99 Season 1-Chapter 99 Season 5")).toBeNull();
    });
    (0, vitest_1.it)("rejette une plage avec une saison hors limite pour un chapitre", () => {
        // Chapter 3 max season = 4
        (0, vitest_1.expect)((0, seasons_1.parseSeasonRange)("Chapter 3 Season 1-Chapter 3 Season 99")).toBeNull();
    });
});
// ── isSeasonInRange ──────────────────────────────────────────────────────────
(0, vitest_1.describe)("isSeasonInRange", () => {
    // ✅ Cas valides — saison dans la plage
    (0, vitest_1.it)("retourne true si la saison est dans la plage", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "Season 1", "Season 5")).toBe(true);
    });
    (0, vitest_1.it)("retourne true si la saison est égale au début (borne incluse)", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 1", "Season 1", "Season 5")).toBe(true);
    });
    (0, vitest_1.it)("retourne true si la saison est égale à la fin (borne incluse)", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 5", "Season 1", "Season 5")).toBe(true);
    });
    (0, vitest_1.it)("retourne true pour une plage d'une seule saison", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "Season 3", "Season 3")).toBe(true);
    });
    (0, vitest_1.it)("fonctionne avec des Chapter", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Chapter 2 Season 4", "Chapter 2 Season 1", "Chapter 2 Season 5")).toBe(true);
    });
    (0, vitest_1.it)("fonctionne avec une plage cross-chapter", () => {
        // "Chapter 2 Saison 5" → 205
        // "Chapter 3 Saison 2" → 302
        // "Chapter 3 Saison 1" → 301, donc 205 ≤ 301 ≤ 302
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Chapter 3 Season 1", "Chapter 2 Season 5", "Chapter 3 Season 2")).toBe(true);
    });
    (0, vitest_1.it)("fonctionne avec des tags normalisés (casse différente)", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("season 3", "SEASON 1", "Season 5")).toBe(true);
    });
    (0, vitest_1.it)("fonctionne avec une plage Season → Chapter (mixte)", () => {
        // "Season 10"  → 110
        // "Season 1"   → 101
        // "Chapter 2 Season 2" → 202
        // 101 ≤ 110 ≤ 202 → true
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 10", "Season 1", "Chapter 2 Season 2")).toBe(true);
    });
    (0, vitest_1.it)("fonctionne avec le début et la fin de la vie du jeu", () => {
        // "Season 1" → 101
        // "Chapter 6 Season 2" → 602
        // "Chapter 3 Season 2" → 302, donc 101 ≤ 302 ≤ 602
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Chapter 3 Season 2", "Season 1", "Chapter 6 Season 2")).toBe(true);
    });
    // ❌ Cas invalides — saison hors plage
    (0, vitest_1.it)("retourne false si la saison est avant la plage", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 1", "Season 3", "Season 5")).toBe(false);
    });
    (0, vitest_1.it)("retourne false si la saison est après la plage", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 8", "Season 1", "Season 5")).toBe(false);
    });
    (0, vitest_1.it)("retourne false pour une saison Chapter hors plage", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Chapter 5 Season 4", "Chapter 2 Season 1", "Chapter 2 Season 8")).toBe(false);
    });
    (0, vitest_1.it)("retourne false si la saison cosmétique est invalide", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 99", "Season 1", "Season 5")).toBe(false);
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("blabla", "Season 1", "Season 5")).toBe(false);
    });
    (0, vitest_1.it)("retourne false si le début de plage est invalide", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "Season 99", "Season 5")).toBe(false);
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "blabla", "Season 5")).toBe(false);
    });
    (0, vitest_1.it)("retourne false si la fin de plage est invalide", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "Season 1", "Season 99")).toBe(false);
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "Season 1", "blabla")).toBe(false);
    });
    (0, vitest_1.it)("retourne false si la plage est inversée (start > end)", () => {
        // getSeasonNumericOrder("Season 5") = 105
        // getSeasonNumericOrder("Season 1") = 101
        // 105 ≤ 103 ≤ 101 → false (start > end donc aucun ordre valide)
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "Season 5", "Season 1")).toBe(false);
    });
    (0, vitest_1.it)("retourne false pour des chaînes vides", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("", "Season 1", "Season 5")).toBe(false);
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "", "Season 5")).toBe(false);
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Season 3", "Season 1", "")).toBe(false);
    });
    // 🧪 Cas limite
    (0, vitest_1.it)("gère une saison Chapter 1 en format simple vs Chapter", () => {
        // "Chapter 1 Season 3" n'est pas dans CHAPTER_MAX_SEASONS? Si, chapitre 1 est reconnu
        // mais normalisé en "Season 3". Donc getSeasonNumericOrder("Chapter 1 Season 3") → 103
        // "Season 1" → 101, "Season 5" → 105. 103 entre 101 et 105 → true
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Chapter 1 Season 3", "Season 1", "Season 5")).toBe(true);
    });
    (0, vitest_1.it)("gère le cas où la saison est identique aux deux bornes", () => {
        (0, vitest_1.expect)((0, seasons_1.isSeasonInRange)("Chapter 4 Season 2", "Chapter 4 Season 2", "Chapter 4 Season 2")).toBe(true);
    });
});
//# sourceMappingURL=seasons.test.js.map