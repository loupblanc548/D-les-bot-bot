"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// Tests unitaires pour extractAllNamesFromEntry() + checkWishlistMatches()
// Valide l'extraction des noms de packs/bundles, le matching, et l'envoi de DMs
const vitest_1 = require("vitest");
const fortnite_api_1 = require("./fortnite-api");
// ─── Mocks Prisma (pattern vi.hoisted, comme dans logs.test.ts) ───
const { mockPrisma } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        wishlist: {
            updateMany: vitest_1.vi.fn().mockResolvedValue({ count: 1 }),
            findMany: vitest_1.vi.fn().mockResolvedValue([]),
        },
        userPreference: {
            findUnique: vitest_1.vi.fn().mockResolvedValue(null),
        },
    },
}));
vitest_1.vi.mock("../prisma", () => ({
    default: mockPrisma,
}));
// ─── Mock fetch global (contrôle de fetchShop indirectement) ───
const mockGlobalFetch = vitest_1.vi.fn();
vitest_1.vi.stubGlobal("fetch", mockGlobalFetch);
// ─────────────────────────────────────────────────────────────────
//  matchesWishlist
// ─────────────────────────────────────────────────────────────────
(0, vitest_1.describe)("matchesWishlist", () => {
    // ─── MATCH EXACT ────────────────────────────────────────
    (0, vitest_1.it)("match exact insensible à la casse", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("Renegade Raider", "Renegade Raider")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("RENEGADE RAIDER", "renegade raider")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("renegade raider", "RENEGADE RAIDER")).toBe(true);
    });
    (0, vitest_1.it)("match exact avec trim automatique", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("  Renegade Raider  ", "Renegade Raider")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("Skin", "  Skin  ")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("  Pack  ", "  pack  ")).toBe(true);
    });
    // ─── WORD-LEVEL MATCHING ────────────────────────────────
    (0, vitest_1.it)("match par mot-clé : un mot de la wishlist présent dans le nom boutique", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("renegade", "Renegade Raider")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("raider", "Renegade Raider")).toBe(true);
    });
    (0, vitest_1.it)("match quand tous les mots de la wishlist sont dans le nom boutique", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("raider renegade", "Renegade Raider")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("skin cool", "Cool Skin")).toBe(true);
    });
    (0, vitest_1.it)("les mots de 1 caractère matchent via boundary regex s'ils sont isolés", () => {
        // Word-level filtre les mots < 2 chars, mais le boundary regex les rattrape
        // "a" isolé en fin de chaîne → précédé d'espace (\\W), en fin de chaîne ($) → match
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("a", "Skin A")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("i", "Item I")).toBe(true);
        // "a" au milieu sans frontière → pas de match
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("a", "abc def")).toBe(false);
    });
    (0, vitest_1.it)("match word-level avec séparateurs variés (tirets, points, espaces)", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("renegade", "Renegade-Raider")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("skin", "cool_skin_pro")).toBe(false); // _ est w en JS, pas split
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("pack", "super.pack")).toBe(true);
    });
    // ─── BOUNDARY REGEX ─────────────────────────────────────
    (0, vitest_1.it)("boundary regex : évite les faux positifs type 'Skin' dans 'Skinny'", () => {
        // "skin" ne doit PAS matcher "skinny" (pas une frontière de mot après "skin")
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("skin", "Skinny")).toBe(false);
        // "scar" ne doit PAS matcher "Scarlet" (même raison)
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("scar", "Scarlet Defender")).toBe(false);
    });
    (0, vitest_1.it)("boundary regex : match quand le mot wishlist est entouré de ponctuation", () => {
        // "skin" dans "Cool Skin!" → espace avant, "!" après = frontières
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("skin", "Cool Skin!")).toBe(true);
        // "raider" dans "(Renegade Raider)" → espace avant, ")" après = frontières
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("raider", "(Renegade Raider)")).toBe(true);
    });
    // ─── AUCUN MATCH ────────────────────────────────────────
    (0, vitest_1.it)("retourne false si aucun mot en commun", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("xyz", "Renegade Raider")).toBe(false);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("Completely Different", "Unrelated Item")).toBe(false);
    });
    (0, vitest_1.it)("retourne false si la wishlist est vide", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("", "Renegade Raider")).toBe(false);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("   ", "Renegade Raider")).toBe(false);
    });
    (0, vitest_1.it)("retourne false si le nom boutique est vide", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("Renegade Raider", "")).toBe(false);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("Skin", "   ")).toBe(false);
    });
    // ─── EDGE CASES ─────────────────────────────────────────
    (0, vitest_1.it)("gère les accents et caractères spéciaux", () => {
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("peau", "Peau Estivale")).toBe(true);
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("épée", "Épée Légendaire")).toBe(true);
    });
    (0, vitest_1.it)("gère les noms avec apostrophes", () => {
        // Split sur \W : "l'ombre" → ["l", "ombre"] ; "L'Ombre" → ["l", "ombre"]
        // "ombre" (2+ chars) est dans les deux → match
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("ombre", "L'Ombre")).toBe(true);
    });
    (0, vitest_1.it)("gère les noms très longs", () => {
        const longName1 = "Super Mega Ultra Legendary Skin of the Eternal Void";
        const longName2 = "Super Mega Ultra Legendary Skin of the Eternal Void";
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)(longName1, longName2)).toBe(true);
    });
    (0, vitest_1.it)("gère les noms avec uniquement des mots de 1 caractère", () => {
        // Tous les mots filtrés (<2 chars), le matching tombe au boundary regex
        // "a b" → w="a b", s="a b" → exact match true
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("a b", "a b")).toBe(true);
        // "a" tout seul → w="a", s="x y" → boundary regex "(^|\\W)a($|\\W)" ne trouve rien
        (0, vitest_1.expect)((0, fortnite_api_1.matchesWishlist)("a", "x y")).toBe(false);
    });
});
// ─────────────────────────────────────────────────────────────────
//  extractAllNamesFromEntry
// ─────────────────────────────────────────────────────────────────
(0, vitest_1.describe)("extractAllNamesFromEntry", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    // ─── BUNDLE / PACK ──────────────────────────────────────
    (0, vitest_1.it)("extrait le nom du pack + les sous-articles d'un bundle Fortnite classique", () => {
        const entry = {
            bundle: { name: "Pack Légendes Estivales" },
            items: [
                { name: "Peau Estivale Pro" },
                { name: "Danseur Solaire" },
                { name: "Pioche Tropicale" },
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toHaveLength(4);
        (0, vitest_1.expect)(result).toContain("pack légendes estivales");
        (0, vitest_1.expect)(result).toContain("peau estivale pro");
        (0, vitest_1.expect)(result).toContain("danseur solaire");
        (0, vitest_1.expect)(result).toContain("pioche tropicale");
    });
    (0, vitest_1.it)("utilise bundle.displayName comme fallback si bundle.name est absent", () => {
        const entry = {
            bundle: { displayName: "Mega Bundle" },
            items: [{ name: "Skin A" }],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toContain("mega bundle");
        (0, vitest_1.expect)(result).toContain("skin a");
    });
    (0, vitest_1.it)("utilise item.displayName comme fallback si item.name est absent", () => {
        const entry = {
            bundle: { name: "Starter Pack" },
            items: [
                { displayName: "Casual Outfit" },
                { name: "Pickaxe Pro" },
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toContain("starter pack");
        (0, vitest_1.expect)(result).toContain("casual outfit");
        (0, vitest_1.expect)(result).toContain("pickaxe pro");
    });
    (0, vitest_1.it)("gère un bundle avec brItems au lieu de items", () => {
        const entry = {
            bundle: { name: "BR Exclusive Pack" },
            brItems: [
                { name: "Battle Royale Skin" },
                { displayName: "Glider Storm" },
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toHaveLength(3);
        (0, vitest_1.expect)(result).toContain("br exclusive pack");
        (0, vitest_1.expect)(result).toContain("battle royale skin");
        (0, vitest_1.expect)(result).toContain("glider storm");
    });
    // ─── ENTRÉE SIMPLE (pas de bundle) ──────────────────────
    (0, vitest_1.it)("extrait uniquement les items pour une entrée sans bundle", () => {
        const entry = {
            items: [
                { name: "Renegade Raider" },
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result).toContain("renegade raider");
    });
    (0, vitest_1.it)("utilise entry.displayName puis entry.name quand il n'y a ni bundle ni items", () => {
        const entry = {
            displayName: "Direct Shop Item",
            items: [],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result).toContain("direct shop item");
    });
    (0, vitest_1.it)("utilise entry.name comme dernier fallback", () => {
        const entry = {
            name: "Fallback Item Name",
            items: [],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result).toContain("fallback item name");
    });
    // ─── ITEMS MULTIPLES SANS BUNDLE ────────────────────────
    (0, vitest_1.it)("extrait tous les items même sans bundle (entrée multi-variantes)", () => {
        const entry = {
            items: [
                { name: "Style 1" },
                { displayName: "Style 2" },
                { name: "Style 3" },
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toHaveLength(3);
        (0, vitest_1.expect)(result).toContain("style 1");
        (0, vitest_1.expect)(result).toContain("style 2");
        (0, vitest_1.expect)(result).toContain("style 3");
    });
    // ─── NORMALISATION (casse, espaces, doublons) ───────────
    (0, vitest_1.it)("normalise tout en minuscules et trim", () => {
        const entry = {
            bundle: { name: "  PACK   ÉTÉ  " },
            items: [
                { name: "  Skin Blanc  " },
                { displayName: "ACCESSOIRE NOIR" },
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toContain("pack   été");
        (0, vitest_1.expect)(result).toContain("skin blanc");
        (0, vitest_1.expect)(result).toContain("accessoire noir");
    });
    (0, vitest_1.it)("élimine les doublons (même nom en minuscule après trim)", () => {
        const entry = {
            bundle: { name: "Mega Pack" },
            items: [
                { name: "MEGA PACK" },
                { name: "Unique Skin" },
                { displayName: "unique skin" },
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        // "mega pack" présent une seule fois, "unique skin" aussi
        (0, vitest_1.expect)(result.filter(n => n === "mega pack")).toHaveLength(1);
        (0, vitest_1.expect)(result.filter(n => n === "unique skin")).toHaveLength(1);
    });
    // ─── EDGE CASES ─────────────────────────────────────────
    (0, vitest_1.it)("retourne un tableau vide silencieusement pour une entrée vide (fetchShop() logue l'avertissement)", () => {
        const entry = { items: [] };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toEqual([]);
        // Plus de console.warn — fetchShop() centralise les avertissements avec plus de contexte
    });
    (0, vitest_1.it)("retourne un tableau vide silencieusement pour une entrée sans bundle/items/displayName/name (fetchShop() logue l'avertissement)", () => {
        const entry = { offerId: "v2:/abc123" };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toEqual([]);
        // Plus de console.warn — fetchShop() centralise les avertissements avec plus de contexte
    });
    (0, vitest_1.it)("ignore les items sans nom (displayName et name absents)", () => {
        const entry = {
            bundle: { name: "Pack Test" },
            items: [
                { name: "Valid Skin" },
                { rarity: "legendary" }, // pas de name/displayName
                { type: "outfit" }, // pas de name/displayName
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toHaveLength(2); // pack test + valid skin
        (0, vitest_1.expect)(result).toContain("pack test");
        (0, vitest_1.expect)(result).toContain("valid skin");
    });
    (0, vitest_1.it)("gère entry.items = undefined (pas d'items du tout)", () => {
        const entry = {
            bundle: { name: "Empty Bundle" },
            // pas d'items
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result).toContain("empty bundle");
    });
    (0, vitest_1.it)("ignore un bundle vide (ni name ni displayName)", () => {
        const entry = {
            bundle: {},
            items: [{ name: "Skin Sans Pack" }],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        (0, vitest_1.expect)(result).toEqual(["skin sans pack"]);
    });
    // ─── RESPECT DE L'ORDRE D'INSERTION ─────────────────────
    (0, vitest_1.it)("préserve l'ordre : nom du bundle en premier, puis les sous-articles", () => {
        const entry = {
            bundle: { name: "ZZZ Pack" },
            items: [
                { name: "AAA Skin" },
                { name: "BBB Skin" },
                { name: "CCC Skin" },
            ],
        };
        const result = (0, fortnite_api_1.extractAllNamesFromEntry)(entry);
        // Le bundle doit être en premier
        (0, vitest_1.expect)(result[0]).toBe("zzz pack");
        // Les sous-articles dans l'ordre
        (0, vitest_1.expect)(result[1]).toBe("aaa skin");
        (0, vitest_1.expect)(result[2]).toBe("bbb skin");
        (0, vitest_1.expect)(result[3]).toBe("ccc skin");
    });
});
// ─────────────────────────────────────────────────────────────────
//  checkWishlistMatches (avec mock fetchShop via global.fetch)
// ─────────────────────────────────────────────────────────────────
(0, vitest_1.describe)("checkWishlistMatches", () => {
    let checkWishlistMatches;
    let fakeUser;
    let mockClient;
    (0, vitest_1.beforeEach)(async () => {
        vitest_1.vi.clearAllMocks();
        mockGlobalFetch.mockReset();
        // Réinitialise le cache des modules pour vider shopCache (évite la pollution entre tests)
        vitest_1.vi.resetModules();
        // Recrée les objets mockés (resetModules vide les imports dynamiques)
        fakeUser = {
            id: "111111111111111111",
            username: "TestUser",
            send: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
        mockClient = {
            users: {
                fetch: vitest_1.vi.fn().mockResolvedValue(fakeUser),
            },
        };
        // Ré-importer après resetModules pour avoir un module frais (shopCache vide)
        const mod = await Promise.resolve().then(() => __importStar(require("./fortnite-api")));
        checkWishlistMatches = mod.checkWishlistMatches;
    });
    (0, vitest_1.afterEach)(() => {
        // Nettoie les fake timers même si un test échoue
        vitest_1.vi.useRealTimers();
    });
    // Helper : construire une réponse API Fortnite simulée
    function mockFortniteApiResponse(entries) {
        return {
            ok: true,
            json: async () => ({
                status: 200,
                data: {
                    date: "2026-06-09",
                    entries,
                },
            }),
        };
    }
    // Helper : construire un ShopEntry (simule ce que fetchShop produit)
    function makeShopEntry(overrides = {}) {
        return {
            displayName: overrides.displayName || "Default Skin",
            allNames: overrides.allNames || [overrides.displayName?.toLowerCase() || "default skin"],
            description: "A test item",
            type: overrides.type || "Outfit",
            rarity: overrides.rarity || "Legendary",
            rarityColor: 0xff6600,
            price: overrides.price ?? 1500,
            icon: overrides.icon || "https://example.com/icon.png",
            featuredImage: overrides.featuredImage || null,
            section: "featured",
        };
    }
    // ─── BOUTIQUE INDISPONIBLE / VIDE ───────────────────────
    (0, vitest_1.it)("retourne 0 si la boutique est indisponible (fetch échoue)", async () => {
        mockGlobalFetch.mockRejectedValue(new Error("Network error"));
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(0);
    });
    (0, vitest_1.it)("retourne 0 si la boutique est vide (0 entrées)", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([]));
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(0);
    });
    (0, vitest_1.it)("retourne 0 si la wishlist est vide", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Some Skin", displayName: "Some Skin" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([]);
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(0);
    });
    // ─── MATCH SIMPLE (displayName fallback) ─────────────────
    (0, vitest_1.it)("envoie un DM quand un item match exactement par displayName", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Renegade Raider", displayName: "Renegade Raider" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "Renegade Raider" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null); // pas de pref → DM autorisé
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(1);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
        const sentEmbed = fakeUser.send.mock.calls[0][0].embeds[0];
        (0, vitest_1.expect)(sentEmbed.data.title).toContain("Renegade Raider");
        (0, vitest_1.expect)(sentEmbed.data.description).toContain("Renegade Raider");
    });
    // ─── MATCH VIA ALLNAMES (PACK) ───────────────────────────
    (0, vitest_1.it)("détecte un skin à l'intérieur d'un pack via allNames", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                bundle: { name: "Pack Légendes Estivales" },
                section: { id: "featured" },
                items: [
                    { name: "Peau Estivale Pro" },
                    { name: "Danseur Solaire" },
                ],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "danseur solaire" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(1);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
        const sentEmbed = fakeUser.send.mock.calls[0][0].embeds[0];
        // L'embed doit mentionner le nom de l'item wishlist
        (0, vitest_1.expect)(sentEmbed.data.description).toContain("danseur solaire");
    });
    (0, vitest_1.it)("détecte un match quand le wishlist item correspond au NOM DU PACK lui-même", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                bundle: { name: "Pack Légendes Estivales" },
                section: { id: "featured" },
                items: [
                    { name: "Peau Estivale Pro" },
                ],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "pack légendes estivales" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(1);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
    });
    // ─── AUCUN MATCH ────────────────────────────────────────
    (0, vitest_1.it)("retourne 0 si aucun item ne correspond à la wishlist", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Unrelated Outfit XYZ" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "Completely Different Item ABC" },
        ]);
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(0);
        (0, vitest_1.expect)(fakeUser.send).not.toHaveBeenCalled();
    });
    // ─── DM PREFERENCE (wishlistDm désactivé) ────────────────
    (0, vitest_1.it)("ignore l'envoi DM si wishlistDm est false", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Cool Skin" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "Cool Skin" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue({
            userId: "111111111111111111",
            wishlistDm: false,
        });
        const result = await checkWishlistMatches(mockClient);
        // Aucun DM envoyé → sentCount = 0
        (0, vitest_1.expect)(result).toBe(0);
        (0, vitest_1.expect)(fakeUser.send).not.toHaveBeenCalled();
    });
    // ─── UTILISATEUR INTROUVABLE ────────────────────────────
    (0, vitest_1.it)("incrémente failCount si l'utilisateur Discord est introuvable", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Ghost Skin" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "999999999999999999", itemName: "Ghost Skin" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        mockClient.users.fetch.mockResolvedValue(null); // utilisateur introuvable
        const result = await checkWishlistMatches(mockClient);
        // sentCount = 0, mais la fonction ne retourne pas failCount
        (0, vitest_1.expect)(result).toBe(0);
        (0, vitest_1.expect)(fakeUser.send).not.toHaveBeenCalled();
    });
    // ─── ÉCHEC DM (DMs fermés) ──────────────────────────────
    (0, vitest_1.it)("incrémente failCount et continue si l'envoi DM échoue", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Blocked Skin" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "Blocked Skin" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        fakeUser.send.mockRejectedValue(new Error("Cannot send messages to this user"));
        const result = await checkWishlistMatches(mockClient);
        // DM échoue → sentCount = 0
        (0, vitest_1.expect)(result).toBe(0);
    });
    // ─── DÉDUPLICATION ──────────────────────────────────────
    (0, vitest_1.it)("déduplique les matchs : un même wishlist item → une seule notification", async () => {
        // Deux entrées de boutique avec le même skin (ex: featured + daily)
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Duplicate Skin" }],
            },
            {
                section: { id: "daily" },
                items: [{ name: "Duplicate Skin" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "Duplicate Skin" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const result = await checkWishlistMatches(mockClient);
        // Une seule notification malgré 2 entrées avec le même skin
        (0, vitest_1.expect)(result).toBe(1);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
    });
    // ─── UTILISATEURS MULTIPLES ─────────────────────────────
    (0, vitest_1.it)("envoie un DM à chaque utilisateur ayant le même item en wishlist", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Popular Skin" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "Popular Skin" },
            { userId: "222222222222222222", itemName: "Popular Skin" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const fakeUser2 = {
            id: "222222222222222222",
            username: "TestUser2",
            send: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
        mockClient.users.fetch
            .mockResolvedValueOnce(fakeUser)
            .mockResolvedValueOnce(fakeUser2);
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(2);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(fakeUser2.send).toHaveBeenCalledTimes(1);
    });
    // ─── DÉLAI ANTI-RATE-LIMIT (ENVOI SÉQUENTIEL) ───────────
    (0, vitest_1.it)("envoie les DMs séquentiellement avec succès (3 matchs → 3 DMs)", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [
                    { name: "Skin One" },
                    { name: "Skin Two" },
                    { name: "Skin Three" },
                ],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "Skin One" },
            { userId: "222222222222222222", itemName: "Skin Two" },
            { userId: "333333333333333333", itemName: "Skin Three" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const fakeUser2 = {
            id: "222222222222222222",
            username: "User2",
            send: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
        const fakeUser3 = {
            id: "333333333333333333",
            username: "User3",
            send: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
        mockClient.users.fetch
            .mockResolvedValueOnce(fakeUser)
            .mockResolvedValueOnce(fakeUser2)
            .mockResolvedValueOnce(fakeUser3);
        const result = await checkWishlistMatches(mockClient);
        // Les 3 DMs sont envoyés (boucle for...of séquentielle complétée)
        (0, vitest_1.expect)(result).toBe(3);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(fakeUser2.send).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(fakeUser3.send).toHaveBeenCalledTimes(1);
    });
    // ─── MATCHING CASE-INSENSITIVE ──────────────────────────
    (0, vitest_1.it)("matche de manière insensible à la casse", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "daily" },
                items: [{ name: "rEnEgAdE rAiDeR" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "RENEGADE RAIDER" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(1);
    });
    (0, vitest_1.it)("matche par mot-clé (word-level matching)", async () => {
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                items: [{ name: "Renegade Raider" }],
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "renegade" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(1);
    });
    // ─── FALLBACK : ENTRY.ITEMS VIDE AVEC ENTRY.NAME VALIDE ──
    (0, vitest_1.it)("crée une ShopEntry via fallback quand entry.items est vide mais entry.name est valide", async () => {
        // Entrée sans items mais avec un nom de premier niveau (cosmétique offert, etc.)
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                name: "Cosmétique Offert Spécial",
                // Pas de items → le fallback doit créer une ShopEntry
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "cosmétique offert" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const result = await checkWishlistMatches(mockClient);
        // Le fallback doit créer une ShopEntry → le match wishlist fonctionne → 1 DM
        (0, vitest_1.expect)(result).toBe(1);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("crée une ShopEntry via fallback quand entry.items est vide mais entry.displayName est valide", async () => {
        // Même test mais avec displayName au lieu de name
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "daily" },
                displayName: "Skin Gratuit Quotidien",
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "skin gratuit" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const result = await checkWishlistMatches(mockClient);
        (0, vitest_1.expect)(result).toBe(1);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("ignore correctement une entrée sans items ET sans nom (vraiment vide)", async () => {
        // Entrée complètement vide : ni items, ni name, ni displayName
        mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([
            {
                section: { id: "featured" },
                offerId: "v2:/empty123",
                // Rien d'exploitable
            },
            {
                section: { id: "featured" },
                name: "Skin Valide",
                // Celle-ci a un nom → doit matcher
            },
        ]));
        mockPrisma.wishlist.findMany.mockResolvedValue([
            { userId: "111111111111111111", itemName: "skin valide" },
        ]);
        mockPrisma.userPreference.findUnique.mockResolvedValue(null);
        const result = await checkWishlistMatches(mockClient);
        // Seul le 2e item matche, l'entrée vide est ignorée sans erreur
        (0, vitest_1.expect)(result).toBe(1);
        (0, vitest_1.expect)(fakeUser.send).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=fortnite-api.test.js.map