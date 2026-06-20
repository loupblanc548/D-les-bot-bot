import { describe, it, expect } from "vitest";
import { parseSeasonRange, isSeasonInRange, getSeasonNumericOrder, normalizeSeason, seasonsMatch, getAllValidSeasons } from "./seasons.js";
// Helpers existants
describe("normalizeSeason", () => {
    it("normalise un format anglais simple", () => {
        expect(normalizeSeason("Season 1")).toBe("Season 1");
        expect(normalizeSeason("Season 10")).toBe("Season 10");
    });
    it("normalise un format français simple", () => {
        expect(normalizeSeason("Saison 3")).toBe("Season 3");
        expect(normalizeSeason("Saison 7")).toBe("Season 7");
    });
    it("normalise un format chapitre anglais", () => {
        expect(normalizeSeason("Chapter 2 Season 1")).toBe("Chapter 2 Season 1");
        expect(normalizeSeason("Chapter 5 Season 4")).toBe("Chapter 5 Season 4");
    });
    it("normalise un format chapitre français", () => {
        expect(normalizeSeason("Chapitre 3 Saison 2")).toBe("Chapter 3 Season 2");
        expect(normalizeSeason("Chapitre 6 Saison 1")).toBe("Chapter 6 Season 1");
    });
    it("rejette une saison inexistante", () => {
        expect(normalizeSeason("Season 99")).toBeNull();
        expect(normalizeSeason("Chapter 2 Season 99")).toBeNull();
    });
    it("rejette un format invalide", () => {
        expect(normalizeSeason("")).toBeNull();
        expect(normalizeSeason("truc")).toBeNull();
        expect(normalizeSeason("Chapter X Season 1")).toBeNull();
    });
});
describe("seasonsMatch", () => {
    it("match deux saisons identiques", () => {
        expect(seasonsMatch("Season 1", "Season 1")).toBe(true);
    });
    it("match indépendamment de la casse", () => {
        expect(seasonsMatch("Season 1", "season 1")).toBe(true);
        expect(seasonsMatch("CHAPTER 2 SEASON 3", "chapter 2 season 3")).toBe(true);
    });
    it("ne match pas des saisons différentes", () => {
        expect(seasonsMatch("Season 1", "Season 2")).toBe(false);
    });
    it("rejette les null", () => {
        expect(seasonsMatch(null, "Season 1")).toBe(false);
        expect(seasonsMatch("Season 1", null)).toBe(false);
        expect(seasonsMatch(null, null)).toBe(false);
    });
});
describe("getSeasonNumericOrder", () => {
    it("calcule l'ordre pour Season", () => {
        expect(getSeasonNumericOrder("Season 1")).toBe(101);
        expect(getSeasonNumericOrder("Season 10")).toBe(110);
    });
    it("calcule l'ordre pour Chapter", () => {
        expect(getSeasonNumericOrder("Chapter 2 Season 1")).toBe(201);
        expect(getSeasonNumericOrder("Chapter 2 Season 8")).toBe(208);
        expect(getSeasonNumericOrder("Chapter 5 Season 4")).toBe(504);
        expect(getSeasonNumericOrder("Chapter 6 Season 2")).toBe(602);
    });
    it("retourne -1 pour une saison invalide", () => {
        expect(getSeasonNumericOrder("Season 99")).toBe(-1);
        expect(getSeasonNumericOrder("truc")).toBe(-1);
    });
    it("conserve l'ordre chronologique", () => {
        const s1 = getSeasonNumericOrder("Season 1");
        const s5 = getSeasonNumericOrder("Season 5");
        const c2s1 = getSeasonNumericOrder("Chapter 2 Season 1");
        const c5s4 = getSeasonNumericOrder("Chapter 5 Season 4");
        expect(s1).toBeLessThan(s5);
        expect(s5).toBeLessThan(c2s1);
        expect(c2s1).toBeLessThan(c5s4);
    });
});
describe("getAllValidSeasons", () => {
    it("retourne un tableau non vide", () => {
        const seasons = getAllValidSeasons();
        expect(seasons.length).toBeGreaterThan(0);
        expect(seasons).toContain("Season 1");
        expect(seasons).toContain("Chapter 2 Season 1");
    });
    it("contient tous les chapitres connus", () => {
        const seasons = getAllValidSeasons();
        expect(seasons).toContain("Season 10"); // Chapter 1 max
        expect(seasons).toContain("Chapter 2 Season 8");
        expect(seasons).toContain("Chapter 3 Season 4");
        expect(seasons).toContain("Chapter 4 Season 4");
        expect(seasons).toContain("Chapter 5 Season 4");
        expect(seasons).toContain("Chapter 6 Season 2");
    });
});
// ── parseSeasonRange ─────────────────────────────────────────────────────────
describe("parseSeasonRange", () => {
    // ✅ Cas valides — séparateur tiret
    it("parse une plage simple avec tiret", () => {
        const result = parseSeasonRange("Season 1-Season 3");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Season 3");
    });
    it("parse une plage avec Chapter", () => {
        const result = parseSeasonRange("Chapter 2 Season 1-Chapter 2 Season 8");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Chapter 2 Season 1");
        expect(result.end).toBe("Chapter 2 Season 8");
    });
    it("parse une plage mixte (Season → Chapter)", () => {
        const result = parseSeasonRange("Season 1-Chapter 2 Season 2");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Chapter 2 Season 2");
    });
    it("parse une plage en français", () => {
        const result = parseSeasonRange("Saison 1-Saison 5");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Season 5");
    });
    it("parse une plage avec 'à'", () => {
        const result = parseSeasonRange("Season 1 à Season 4");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Season 4");
    });
    it("parse une plage avec 'to'", () => {
        const result = parseSeasonRange("Season 2 to Season 6");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 2");
        expect(result.end).toBe("Season 6");
    });
    it("parse avec tiret cadratin (—)", () => {
        const result = parseSeasonRange("Season 1 — Season 3");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Season 3");
    });
    it("parse avec tiret demi-cadratin (–)", () => {
        const result = parseSeasonRange("Season 1 – Season 3");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Season 3");
    });
    it("parse avec flèche (→)", () => {
        const result = parseSeasonRange("Season 1 → Season 4");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Season 4");
    });
    it("parse même avec des espaces superflus", () => {
        const result = parseSeasonRange("  Season 1   -   Season 3  ");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Season 3");
    });
    it("parse une plage qui commence et finit par la même saison", () => {
        const result = parseSeasonRange("Season 3-Season 3");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 3");
        expect(result.end).toBe("Season 3");
    });
    it("parse sans espace autour du tiret", () => {
        const result = parseSeasonRange("Season 1-Season 2");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Season 2");
    });
    it("parse avec majuscules mélangées", () => {
        const result = parseSeasonRange("season 1 - CHAPTER 2 SEASON 3");
        expect(result).not.toBeNull();
        expect(result.start).toBe("Season 1");
        expect(result.end).toBe("Chapter 2 Season 3");
    });
    it("parse Chapter 1 Season X (format historique)", () => {
        const result = parseSeasonRange("Chapter 1 Season 2-Chapter 1 Season 5");
        expect(result).not.toBeNull();
        // Chapter 1 est normalisé sans le numéro de chapitre
        expect(result.start).toBe("Season 2");
        expect(result.end).toBe("Season 5");
    });
    // ❌ Cas invalides
    it("rejette si start > end", () => {
        expect(parseSeasonRange("Season 5-Season 1")).toBeNull();
        expect(parseSeasonRange("Chapter 3 Season 2-Chapter 2 Season 5")).toBeNull();
    });
    it("rejette sans séparateur", () => {
        expect(parseSeasonRange("Season 1")).toBeNull();
        expect(parseSeasonRange("Chapter 2 Season 3")).toBeNull();
    });
    it("rejette une saison invalide dans la plage", () => {
        expect(parseSeasonRange("Season 1-Season 99")).toBeNull();
        expect(parseSeasonRange("Season 99-Season 100")).toBeNull();
        expect(parseSeasonRange("Chapter 2 Season 99-Chapter 3 Season 1")).toBeNull();
    });
    it("rejette une entrée vide", () => {
        expect(parseSeasonRange("")).toBeNull();
        expect(parseSeasonRange("   ")).toBeNull();
    });
    it("rejette du texte arbitraire", () => {
        expect(parseSeasonRange("blabla")).toBeNull();
        expect(parseSeasonRange("truc - machin")).toBeNull();
    });
    it("rejette un seul côté valide", () => {
        expect(parseSeasonRange("Season 1 - blabla")).toBeNull();
        expect(parseSeasonRange("blabla - Season 5")).toBeNull();
    });
    it("rejette un séparateur 'to/'à' collé sans espaces (mot dans le texte)", () => {
        // "Season 1to Season 5" → "to" fait partie du mot, pas de séparateur reconnu
        // La regex attend un espace avant "to"/"à"
        expect(parseSeasonRange("Season 1to Season 5")).toBeNull();
    });
    it("rejette une plage avec 3 saisons (plus d'un séparateur)", () => {
        // Le premier groupe capture tout avant le premier tiret, le 2e tout après le dernier
        // "Season 1-Season 2-Season 3" → start="Season 1", end="Season 2-Season 3"
        // "Season 2-Season 3" n'est pas normalisable → null
        expect(parseSeasonRange("Season 1-Season 2-Season 3")).toBeNull();
    });
    it("rejette une plage avec un chapitre invalide", () => {
        expect(parseSeasonRange("Chapter 99 Season 1-Chapter 99 Season 5")).toBeNull();
    });
    it("rejette une plage avec une saison hors limite pour un chapitre", () => {
        // Chapter 3 max season = 4
        expect(parseSeasonRange("Chapter 3 Season 1-Chapter 3 Season 99")).toBeNull();
    });
});
// ── isSeasonInRange ──────────────────────────────────────────────────────────
describe("isSeasonInRange", () => {
    // ✅ Cas valides — saison dans la plage
    it("retourne true si la saison est dans la plage", () => {
        expect(isSeasonInRange("Season 3", "Season 1", "Season 5")).toBe(true);
    });
    it("retourne true si la saison est égale au début (borne incluse)", () => {
        expect(isSeasonInRange("Season 1", "Season 1", "Season 5")).toBe(true);
    });
    it("retourne true si la saison est égale à la fin (borne incluse)", () => {
        expect(isSeasonInRange("Season 5", "Season 1", "Season 5")).toBe(true);
    });
    it("retourne true pour une plage d'une seule saison", () => {
        expect(isSeasonInRange("Season 3", "Season 3", "Season 3")).toBe(true);
    });
    it("fonctionne avec des Chapter", () => {
        expect(isSeasonInRange("Chapter 2 Season 4", "Chapter 2 Season 1", "Chapter 2 Season 5")).toBe(true);
    });
    it("fonctionne avec une plage cross-chapter", () => {
        // "Chapter 2 Saison 5" → 205
        // "Chapter 3 Saison 2" → 302
        // "Chapter 3 Saison 1" → 301, donc 205 ≤ 301 ≤ 302
        expect(isSeasonInRange("Chapter 3 Season 1", "Chapter 2 Season 5", "Chapter 3 Season 2")).toBe(true);
    });
    it("fonctionne avec des tags normalisés (casse différente)", () => {
        expect(isSeasonInRange("season 3", "SEASON 1", "Season 5")).toBe(true);
    });
    it("fonctionne avec une plage Season → Chapter (mixte)", () => {
        // "Season 10"  → 110
        // "Season 1"   → 101
        // "Chapter 2 Season 2" → 202
        // 101 ≤ 110 ≤ 202 → true
        expect(isSeasonInRange("Season 10", "Season 1", "Chapter 2 Season 2")).toBe(true);
    });
    it("fonctionne avec le début et la fin de la vie du jeu", () => {
        // "Season 1" → 101
        // "Chapter 6 Season 2" → 602
        // "Chapter 3 Season 2" → 302, donc 101 ≤ 302 ≤ 602
        expect(isSeasonInRange("Chapter 3 Season 2", "Season 1", "Chapter 6 Season 2")).toBe(true);
    });
    // ❌ Cas invalides — saison hors plage
    it("retourne false si la saison est avant la plage", () => {
        expect(isSeasonInRange("Season 1", "Season 3", "Season 5")).toBe(false);
    });
    it("retourne false si la saison est après la plage", () => {
        expect(isSeasonInRange("Season 8", "Season 1", "Season 5")).toBe(false);
    });
    it("retourne false pour une saison Chapter hors plage", () => {
        expect(isSeasonInRange("Chapter 5 Season 4", "Chapter 2 Season 1", "Chapter 2 Season 8")).toBe(false);
    });
    it("retourne false si la saison cosmétique est invalide", () => {
        expect(isSeasonInRange("Season 99", "Season 1", "Season 5")).toBe(false);
        expect(isSeasonInRange("blabla", "Season 1", "Season 5")).toBe(false);
    });
    it("retourne false si le début de plage est invalide", () => {
        expect(isSeasonInRange("Season 3", "Season 99", "Season 5")).toBe(false);
        expect(isSeasonInRange("Season 3", "blabla", "Season 5")).toBe(false);
    });
    it("retourne false si la fin de plage est invalide", () => {
        expect(isSeasonInRange("Season 3", "Season 1", "Season 99")).toBe(false);
        expect(isSeasonInRange("Season 3", "Season 1", "blabla")).toBe(false);
    });
    it("retourne false si la plage est inversée (start > end)", () => {
        // getSeasonNumericOrder("Season 5") = 105
        // getSeasonNumericOrder("Season 1") = 101
        // 105 ≤ 103 ≤ 101 → false (start > end donc aucun ordre valide)
        expect(isSeasonInRange("Season 3", "Season 5", "Season 1")).toBe(false);
    });
    it("retourne false pour des chaînes vides", () => {
        expect(isSeasonInRange("", "Season 1", "Season 5")).toBe(false);
        expect(isSeasonInRange("Season 3", "", "Season 5")).toBe(false);
        expect(isSeasonInRange("Season 3", "Season 1", "")).toBe(false);
    });
    // 🧪 Cas limite
    it("gère une saison Chapter 1 en format simple vs Chapter", () => {
        // "Chapter 1 Season 3" n'est pas dans CHAPTER_MAX_SEASONS? Si, chapitre 1 est reconnu
        // mais normalisé en "Season 3". Donc getSeasonNumericOrder("Chapter 1 Season 3") → 103
        // "Season 1" → 101, "Season 5" → 105. 103 entre 101 et 105 → true
        expect(isSeasonInRange("Chapter 1 Season 3", "Season 1", "Season 5")).toBe(true);
    });
    it("gère le cas où la saison est identique aux deux bornes", () => {
        expect(isSeasonInRange("Chapter 4 Season 2", "Chapter 4 Season 2", "Chapter 4 Season 2")).toBe(true);
    });
});
//# sourceMappingURL=seasons.test.js.map