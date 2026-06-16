/**
 * Test d'intégration — freeGamesCron
 *
 * Mocke UNIQUEMENT l'appel HTTP (rss-parser parseURL).
 * Le parsing XML est effectué par le VRAI rss-parser (parseString).
 * Toute la chaîne de traitement tourne en conditions réelles :
 *   parse XML → filtrage Epic → déduplication Prisma → construction Embed → post Discord.
 */
export {};
//# sourceMappingURL=freeGamesCron.integration.test.d.ts.map