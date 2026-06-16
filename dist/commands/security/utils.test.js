"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const utils_1 = require("./utils");
(0, vitest_1.describe)("checkSuspiciousLinks", () => {
    (0, vitest_1.it)("retourne false pour un texte sans URL", () => {
        (0, vitest_1.expect)((0, utils_1.checkSuspiciousLinks)("Bonjour à tous !")).toBe(false);
    });
    (0, vitest_1.it)("détecte une IP directe", () => {
        (0, vitest_1.expect)((0, utils_1.checkSuspiciousLinks)("Visitez http://192.168.1.1/login")).toBe(true);
    });
    (0, vitest_1.it)("détecte un TLD suspect", () => {
        (0, vitest_1.expect)((0, utils_1.checkSuspiciousLinks)("Promo sur http://free-stuff.tk")).toBe(true);
    });
    (0, vitest_1.it)("détecte un raccourcisseur d'URL", () => {
        (0, vitest_1.expect)((0, utils_1.checkSuspiciousLinks)("Voir https://bit.ly/abc123")).toBe(true);
    });
    (0, vitest_1.it)("détecte un motif de phishing (nitro)", () => {
        (0, vitest_1.expect)((0, utils_1.checkSuspiciousLinks)("Claim your free-nitro http://evil.com")).toBe(true);
    });
    (0, vitest_1.it)("retourne false pour une URL bénigne", () => {
        (0, vitest_1.expect)((0, utils_1.checkSuspiciousLinks)("Voir https://discord.com/channels/@me")).toBe(false);
    });
});
(0, vitest_1.describe)("checkSuspiciousLinksDetailed", () => {
    (0, vitest_1.it)("retourne un tableau vide pour un texte sûr", () => {
        (0, vitest_1.expect)((0, utils_1.checkSuspiciousLinksDetailed)("Salut !")).toEqual([]);
    });
    (0, vitest_1.it)("retourne plusieurs flags pour un contenu très suspect", () => {
        const flags = (0, utils_1.checkSuspiciousLinksDetailed)("http://1.2.3.4 https://bit.ly/abc");
        (0, vitest_1.expect)(flags.length).toBeGreaterThanOrEqual(2);
    });
    (0, vitest_1.it)("détecte les URL malformées", () => {
        const flags = (0, utils_1.checkSuspiciousLinksDetailed)("http://[invalid");
        (0, vitest_1.expect)(flags).toContain("URL malformée");
    });
});
//# sourceMappingURL=utils.test.js.map