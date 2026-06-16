"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma } = vitest_1.vi.hoisted(() => ({
    mockPrisma: { wishlist: { findUnique: vitest_1.vi.fn(), findMany: vitest_1.vi.fn(), create: vitest_1.vi.fn(), deleteMany: vitest_1.vi.fn() }, userPreference: { findUnique: vitest_1.vi.fn(), upsert: vitest_1.vi.fn() } },
}));
vitest_1.vi.mock("../../prisma", () => ({ default: mockPrisma }));
vitest_1.vi.mock("../../services/fortnite-cosmetics", () => ({ validateCosmeticName: vitest_1.vi.fn(), searchCosmetics: vitest_1.vi.fn() }));
vitest_1.vi.mock("../../services/fortnite-api", () => ({ fetchShop: vitest_1.vi.fn() }));
const wishlist_1 = require("./wishlist");
const fortnite_api_1 = require("../../services/fortnite-api");
const fortnite_cosmetics_1 = require("../../services/fortnite-cosmetics");
function mi(o = {}) {
    return {
        options: { getString: vitest_1.vi.fn((n) => n === "action" ? (o.action ?? "add") : (o.nom ?? null)) },
        user: o.user ?? { id: "u1", tag: "Test#1234", username: "Test", displayName: "Test" },
        guildId: "g1", reply: vitest_1.vi.fn().mockResolvedValue(undefined), followUp: vitest_1.vi.fn().mockResolvedValue(undefined), deferReply: vitest_1.vi.fn().mockResolvedValue(undefined), editReply: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
}
(0, vitest_1.describe)("add", () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)("ajoute un item (lowercase+trim)", async () => {
        fortnite_cosmetics_1.validateCosmeticName.mockResolvedValue(true);
        mockPrisma.wishlist.findUnique.mockResolvedValue(null);
        mockPrisma.wishlist.create.mockResolvedValue({});
        await (0, wishlist_1.handleCommand)(mi({ nom: "  Renegade Raider  " }));
        (0, vitest_1.expect)(mockPrisma.wishlist.create).toHaveBeenCalledWith({ data: { userId: "u1", itemName: "renegade raider" } });
    });
    (0, vitest_1.it)("refuse nom vide", async () => {
        await (0, wishlist_1.handleCommand)(mi({ nom: "" }));
        (0, vitest_1.expect)(mockPrisma.wishlist.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("refuse nom null", async () => {
        await (0, wishlist_1.handleCommand)(mi({ nom: null }));
        (0, vitest_1.expect)(mockPrisma.wishlist.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("refuse item invalide", async () => {
        fortnite_cosmetics_1.validateCosmeticName.mockResolvedValue(false);
        await (0, wishlist_1.handleCommand)(mi({ nom: "Fake" }));
        (0, vitest_1.expect)(mockPrisma.wishlist.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("refuse doublon", async () => {
        fortnite_cosmetics_1.validateCosmeticName.mockResolvedValue(true);
        mockPrisma.wishlist.findUnique.mockResolvedValue({ id: 1 });
        await (0, wishlist_1.handleCommand)(mi({ nom: "Test" }));
        (0, vitest_1.expect)(mockPrisma.wishlist.create).not.toHaveBeenCalled();
    });
});
(0, vitest_1.describe)("remove", () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)("supprime un item", async () => {
        mockPrisma.wishlist.deleteMany.mockResolvedValue({ count: 1 });
        await (0, wishlist_1.handleCommand)(mi({ action: "remove", nom: "Test" }));
        (0, vitest_1.expect)(mockPrisma.wishlist.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", itemName: "test" } });
    });
    (0, vitest_1.it)("signale item non trouve", async () => {
        mockPrisma.wishlist.deleteMany.mockResolvedValue({ count: 0 });
        await (0, wishlist_1.handleCommand)(mi({ action: "remove", nom: "X" }));
        (0, vitest_1.expect)(mockPrisma.wishlist.deleteMany).toHaveBeenCalled();
    });
});
(0, vitest_1.describe)("list", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        fortnite_api_1.fetchShop.mockResolvedValue(null); // pas de shop → liste simple
    });
    (0, vitest_1.it)("affiche liste vide", async () => {
        mockPrisma.wishlist.findMany.mockResolvedValue([]);
        await (0, wishlist_1.handleCommand)(mi({ action: "list" }));
        (0, vitest_1.expect)(mockPrisma.wishlist.findMany).toHaveBeenCalled();
    });
    (0, vitest_1.it)("affiche items dans embed", async () => {
        mockPrisma.wishlist.findMany.mockResolvedValue([{ id: 1, itemName: "skin1", createdAt: new Date() }]);
        await (0, wishlist_1.handleCommand)(mi({ action: "list" }));
        (0, vitest_1.expect)(mockPrisma.wishlist.findMany).toHaveBeenCalled();
    });
});
(0, vitest_1.describe)("erreurs", () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)("capture erreur Prisma", async () => {
        fortnite_cosmetics_1.validateCosmeticName.mockResolvedValue(true);
        mockPrisma.wishlist.findUnique.mockRejectedValue(new Error("DB locked"));
        await (0, wishlist_1.handleCommand)(mi({ nom: "Test" }));
    });
    (0, vitest_1.it)("fallback followUp si reply echoue", async () => {
        fortnite_cosmetics_1.validateCosmeticName.mockResolvedValue(true);
        mockPrisma.wishlist.findUnique.mockRejectedValue(new Error("x"));
        const m = mi({ nom: "Test" });
        m.reply.mockRejectedValue(new Error("deja repondu"));
        await (0, wishlist_1.handleCommand)(m);
        (0, vitest_1.expect)(m.followUp).toHaveBeenCalled();
    });
});
(0, vitest_1.describe)("autocomplete", () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)("retourne suggestions (fallback searchCosmetics)", async () => {
        fortnite_api_1.fetchShop.mockResolvedValue(null); // shop down, fallback actif
        fortnite_cosmetics_1.searchCosmetics.mockResolvedValue(["A", "B"]);
        const ai = { commandName: "wishlist", options: { getFocused: vitest_1.vi.fn().mockReturnValue({ name: "nom", value: "x" }) }, respond: vitest_1.vi.fn() };
        await (0, wishlist_1.handleAutocomplete)(ai);
        (0, vitest_1.expect)(ai.respond).toHaveBeenCalledWith([{ name: "A", value: "A" }, { name: "B", value: "B" }]);
    });
    (0, vitest_1.it)("ignore autre commande", async () => {
        const ai = { commandName: "autre", options: { getFocused: vitest_1.vi.fn() }, respond: vitest_1.vi.fn() };
        await (0, wishlist_1.handleAutocomplete)(ai);
        (0, vitest_1.expect)(ai.respond).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("retourne vide si erreur", async () => {
        fortnite_api_1.fetchShop.mockResolvedValue(null);
        fortnite_cosmetics_1.searchCosmetics.mockRejectedValue(new Error("x"));
        const ai = { commandName: "wishlist", options: { getFocused: vitest_1.vi.fn().mockReturnValue({ name: "nom", value: "x" }) }, respond: vitest_1.vi.fn() };
        await (0, wishlist_1.handleAutocomplete)(ai);
        (0, vitest_1.expect)(ai.respond).toHaveBeenCalledWith([]);
    });
    (0, vitest_1.describe)("notify", () => {
        (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
        (0, vitest_1.it)("active les DM si actuellement desactives", async () => {
            mockPrisma.userPreference.findUnique.mockResolvedValue({ userId: "u1", wishlistDm: false });
            mockPrisma.userPreference.upsert.mockResolvedValue({});
            const m = mi({ action: "notify" });
            await (0, wishlist_1.handleCommand)(m);
            (0, vitest_1.expect)(mockPrisma.userPreference.upsert).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                create: vitest_1.expect.objectContaining({ wishlistDm: true }),
                update: vitest_1.expect.objectContaining({ wishlistDm: true }),
            }));
            (0, vitest_1.expect)(m.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ content: vitest_1.expect.stringContaining("activées") }));
        });
        (0, vitest_1.it)("desactive les DM si actuellement actifs", async () => {
            mockPrisma.userPreference.findUnique.mockResolvedValue({ userId: "u1", wishlistDm: true });
            mockPrisma.userPreference.upsert.mockResolvedValue({});
            const m = mi({ action: "notify" });
            await (0, wishlist_1.handleCommand)(m);
            (0, vitest_1.expect)(mockPrisma.userPreference.upsert).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                create: vitest_1.expect.objectContaining({ wishlistDm: false }),
                update: vitest_1.expect.objectContaining({ wishlistDm: false }),
            }));
            (0, vitest_1.expect)(m.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ content: vitest_1.expect.stringContaining("désactivées") }));
        });
        (0, vitest_1.it)("active les DM par defaut si pas de preference existante", async () => {
            mockPrisma.userPreference.findUnique.mockResolvedValue(null);
            mockPrisma.userPreference.upsert.mockResolvedValue({});
            const m = mi({ action: "notify" });
            await (0, wishlist_1.handleCommand)(m);
            // Par défaut wishlistDm = true → toggle → false
            (0, vitest_1.expect)(mockPrisma.userPreference.upsert).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                create: vitest_1.expect.objectContaining({ wishlistDm: false }),
            }));
        });
    });
});
//# sourceMappingURL=wishlist.test.js.map