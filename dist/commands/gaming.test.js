"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockLogger, mockItad } = vitest_1.vi.hoisted(() => ({
    mockLogger: {
        info: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
    },
    mockItad: {
        getDeals: vitest_1.vi.fn(),
        buildDealEmbed: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
vitest_1.vi.mock("../services/itad", () => mockItad);
const gaming_1 = require("./gaming");
function mi(o = {}) {
    return {
        commandName: o.commandName ?? "game-status",
        options: {
            getString: vitest_1.vi.fn((name) => {
                if (name === "jeu")
                    return o.game ?? null;
                return null;
            }),
        },
        deferReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        editReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        reply: vitest_1.vi.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
    };
}
function getEditReplyEmbeds(interaction) {
    const call = interaction.editReply.mock.calls[0][0];
    return call?.embeds ?? [];
}
// ═══════════════════════════════════════════════════════════════
// handleGameStatus
// ═══════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handleGameStatus (via handleCommand)", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.describe)("unknown game", () => {
        (0, vitest_1.it)("repond avec un embed d'erreur pour un jeu non reconnu", async () => {
            const interaction = mi({ game: "jeu_invente" });
            await (0, gaming_1.handleCommand)(interaction);
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
            (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledTimes(1);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds).toHaveLength(1);
            (0, vitest_1.expect)(embeds[0].data.description).toContain("non reconnu");
            (0, vitest_1.expect)(embeds[0].data.color).toBe(0xff3344);
        });
    });
    (0, vitest_1.describe)("missing game option", () => {
        (0, vitest_1.it)("repond avec une erreur quand l'option jeu est null", async () => {
            const interaction = mi({ game: null });
            await (0, gaming_1.handleCommand)(interaction);
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.description).toContain("non reconnu");
        });
    });
    (0, vitest_1.describe)("operational services", () => {
        vitest_1.it.each([
            { game: "fortnite", url: "https://status.epicgames.com/api/v2/status.json" },
            { game: "epic", url: "https://status.epicgames.com/api/v2/status.json" },
            { game: "roblox", url: "https://status.roblox.com/api/v2/status.json" },
            { game: "steam", url: "https://crowbar.steamstat.us/" },
            { game: "psn", url: "https://status.playstation.com/" },
            { game: "xbox", url: "https://support.xbox.com/fr-FR/xbox-live-status" },
            { game: "ea", url: "https://www.ea.com/fr-fr/ea-app" },
            { game: "ubisoft", url: "https://www.ubisoft.com/fr-fr/" },
            { game: "riot", url: "https://status.riotgames.com/" },
            { game: "helldivers2", url: "https://www.playstation.com/fr-fr/games/helldivers-2/" },
            { game: "gta", url: "https://support.rockstargames.com/fr/" },
            { game: "cod", url: "https://support.activision.com/fr/call-of-duty" },
        ])("affiche 'Opérationnel' pour $game", async ({ game, url }) => {
            const fetchMock = vitest_1.vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
            });
            vitest_1.vi.stubGlobal("fetch", fetchMock);
            const interaction = mi({ game });
            await (0, gaming_1.handleCommand)(interaction);
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
            (0, vitest_1.expect)(fetchMock).toHaveBeenCalledWith(url, vitest_1.expect.objectContaining({ signal: vitest_1.expect.any(AbortSignal) }));
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds).toHaveLength(1);
            (0, vitest_1.expect)(embeds[0].data.description).toContain("Opérationnel");
            (0, vitest_1.expect)(embeds[0].data.description).toContain("Aucun problème signalé");
            (0, vitest_1.expect)(embeds[0].data.color).toBe(0x53fc18);
            (0, vitest_1.expect)(embeds[0].data.fields).toContainEqual(vitest_1.expect.objectContaining({ name: vitest_1.expect.stringContaining("Page statut") }));
        });
    });
    (0, vitest_1.describe)("degraded services", () => {
        (0, vitest_1.it)("affiche 'Perturbations possibles' quand 503", async () => {
            vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
            }));
            const interaction = mi({ game: "steam" });
            await (0, gaming_1.handleCommand)(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.description).toContain("Perturbations possibles");
            (0, vitest_1.expect)(embeds[0].data.color).toBe(0xffaa00);
        });
        (0, vitest_1.it)("affiche 'Perturbations possibles' sur un 404", async () => {
            vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            }));
            const interaction = mi({ game: "fortnite" });
            await (0, gaming_1.handleCommand)(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.description).toContain("Perturbations possibles");
            (0, vitest_1.expect)(embeds[0].data.color).toBe(0xffaa00);
        });
    });
    (0, vitest_1.describe)("network errors", () => {
        (0, vitest_1.it)("affiche 'Statut inconnu' quand fetch lève une exception", async () => {
            vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockRejectedValue(new Error("Network error")));
            const interaction = mi({ game: "psn" });
            await (0, gaming_1.handleCommand)(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.description).toContain("Statut inconnu");
            (0, vitest_1.expect)(embeds[0].data.description).toContain("Impossible de contacter le service");
            (0, vitest_1.expect)(embeds[0].data.color).toBe(0xffaa00);
        });
        (0, vitest_1.it)("survit à une erreur AbortError", async () => {
            const abortError = new Error("The operation was aborted");
            abortError.name = "AbortError";
            vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockRejectedValue(abortError));
            const interaction = mi({ game: "riot" });
            await (0, gaming_1.handleCommand)(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.description).toContain("Statut inconnu");
        });
        (0, vitest_1.it)("survit quand fetch renvoie un objet sans ok", async () => {
            vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({
                status: 200,
            }));
            const interaction = mi({ game: "xbox" });
            await (0, gaming_1.handleCommand)(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.description).toContain("Opérationnel");
        });
    });
    (0, vitest_1.describe)("embed structure", () => {
        (0, vitest_1.it)("inclut le titre avec emoji et nom du jeu", async () => {
            vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({ ok: true, status: 200 }));
            const interaction = mi({ game: "fortnite" });
            await (0, gaming_1.handleCommand)(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.title).toContain("Fortnite");
            (0, vitest_1.expect)(embeds[0].data.footer).toBeDefined();
            (0, vitest_1.expect)(embeds[0].data.timestamp).toBeDefined();
        });
        (0, vitest_1.it)("inclut le lien page statut même en erreur", async () => {
            vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockRejectedValue(new Error("offline")));
            const interaction = mi({ game: "roblox" });
            await (0, gaming_1.handleCommand)(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.fields).toContainEqual(vitest_1.expect.objectContaining({
                name: vitest_1.expect.stringContaining("Page statut"),
                value: "https://status.roblox.com/",
            }));
        });
    });
    (0, vitest_1.describe)("nintendo special case", () => {
        (0, vitest_1.it)("gère Nintendo avec même URL page et status", async () => {
            const fetchMock = vitest_1.vi.fn().mockResolvedValue({ ok: true, status: 200 });
            vitest_1.vi.stubGlobal("fetch", fetchMock);
            const interaction = mi({ game: "nintendo" });
            await (0, gaming_1.handleCommand)(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            (0, vitest_1.expect)(embeds[0].data.title).toContain("Nintendo");
            (0, vitest_1.expect)(fetchMock).toHaveBeenCalledWith("https://www.nintendo.com/fr-fr/", vitest_1.expect.objectContaining({ signal: vitest_1.expect.any(AbortSignal) }));
        });
    });
});
// ═══════════════════════════════════════════════════════════════
// handleFreeGames
// ═══════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handleFreeGames (via handleCommand)", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.unstubAllGlobals();
    });
    function epicResponse(freeGames) {
        return {
            ok: true,
            status: 200,
            json: vitest_1.vi.fn().mockResolvedValue({
                data: {
                    Catalog: {
                        searchStore: {
                            elements: freeGames.map((g, i) => ({
                                title: g.title ?? `Free Game ${i}`,
                                description: g.description ?? "A great free game!",
                                price: { totalPrice: { fmtPrice: { originalPrice: g.originalPrice ?? "29,99€" } } },
                                promotions: {
                                    promotionalOffers: [{
                                            promotionalOffers: [{
                                                    endDate: g.endDate ?? "2026-06-20T00:00:00.000Z",
                                                }],
                                        }],
                                },
                            })),
                        },
                    },
                },
            }),
        };
    }
    (0, vitest_1.it)("affiche un jeu gratuit avec tous les champs", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue(epicResponse([{ title: "Among Us", originalPrice: "3,99€", endDate: "2026-06-20T00:00:00.000Z" }])));
        const interaction = mi({ commandName: "free-games" });
        await (0, gaming_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds).toHaveLength(1);
        (0, vitest_1.expect)(embeds[0].data.title).toContain("Among Us");
        (0, vitest_1.expect)(embeds[0].data.title).toContain("GRATUIT");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0x00f0ff);
        (0, vitest_1.expect)(embeds[0].data.fields).toContainEqual(vitest_1.expect.objectContaining({ name: "💰 Prix original", value: "3,99€" }));
        (0, vitest_1.expect)(embeds[0].data.fields).toContainEqual(vitest_1.expect.objectContaining({ name: "⏰ Fin de l'offre" }));
        (0, vitest_1.expect)(embeds[0].data.footer).toBeDefined();
        (0, vitest_1.expect)(embeds[0].data.timestamp).toBeDefined();
    });
    (0, vitest_1.it)("ajoute un champ 'Autres' quand plusieurs jeux gratuits", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue(epicResponse([
            { title: "Game A" },
            { title: "Game B" },
            { title: "Game C" },
        ])));
        const interaction = mi({ commandName: "free-games" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.fields).toContainEqual(vitest_1.expect.objectContaining({ name: "📦 Autres", value: "2 autre(s) jeu(x) gratuit(s)" }));
    });
    (0, vitest_1.it)("n'ajoute pas le champ 'Autres' pour un seul jeu", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue(epicResponse([{ title: "Only Game" }])));
        const interaction = mi({ commandName: "free-games" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        const autresField = embeds[0].data.fields?.find((f) => f.name === "📦 Autres");
        (0, vitest_1.expect)(autresField).toBeUndefined();
    });
    (0, vitest_1.it)("affiche 'aucun jeu gratuit' quand la liste est vide", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue(epicResponse([])));
        const interaction = mi({ commandName: "free-games" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("Aucun jeu gratuit");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xffaa00);
    });
    (0, vitest_1.it)("affiche une erreur quand l'API échoue (HTTP error)", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        const interaction = mi({ commandName: "free-games" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("Impossible de récupérer");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xff3344);
    });
    (0, vitest_1.it)("affiche une erreur quand fetch lève une exception", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockRejectedValue(new Error("Network down")));
        const interaction = mi({ commandName: "free-games" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("Impossible de récupérer");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xff3344);
    });
    (0, vitest_1.it)("gère les données partielles (pas de description, pas de prix)", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vitest_1.vi.fn().mockResolvedValue({
                data: {
                    Catalog: {
                        searchStore: {
                            elements: [{
                                    title: "Bare Game",
                                    promotions: { promotionalOffers: [{}] },
                                }],
                        },
                    },
                },
            }),
        }));
        const interaction = mi({ commandName: "free-games" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.title).toContain("Bare Game");
    });
});
// ═══════════════════════════════════════════════════════════════
// handlePatchNotes
// ═══════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handlePatchNotes (via handleCommand)", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    vitest_1.it.each([
        { game: "fortnite", name: "Fortnite", url: "https://www.fortnite.com/news" },
        { game: "helldivers2", name: "Helldivers 2", url: "https://store.steampowered.com/news/app/553850" },
        { game: "cod", name: "Call of Duty", url: "https://www.callofduty.com/fr/patchnotes" },
        { game: "gta", name: "GTA Online", url: "https://support.rockstargames.com/fr/categories/200013106" },
    ])("affiche les patch notes de $game", async ({ game, name, url }) => {
        const interaction = mi({ commandName: "patch-notes", game });
        await (0, gaming_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds).toHaveLength(1);
        (0, vitest_1.expect)(embeds[0].data.title).toContain(name);
        (0, vitest_1.expect)(embeds[0].data.description).toContain(url);
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0x2f3136);
    });
    (0, vitest_1.it)("affiche une erreur pour un jeu non supporté", async () => {
        const interaction = mi({ commandName: "patch-notes", game: "minecraft" });
        await (0, gaming_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("non reconnu");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xff3344);
    });
    (0, vitest_1.it)("affiche une erreur pour une option jeu null", async () => {
        const interaction = mi({ commandName: "patch-notes", game: null });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("non reconnu");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xff3344);
    });
});
// ═══════════════════════════════════════════════════════════════
// handleDeal
// ═══════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handleDeal (via handleCommand)", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockItad.getDeals.mockResolvedValue(null);
        mockItad.buildDealEmbed.mockReturnValue({});
    });
    (0, vitest_1.it)("appelle getDeals avec le nom du jeu et buildDealEmbed avec le résultat", async () => {
        const dealResult = {
            title: "Hollow Knight",
            prices: [
                { shop: "Steam", price: "14,99€", url: "https://store.steampowered.com/app/367520" },
            ],
        };
        const mockEmbed = { data: { title: "💰 Hollow Knight", color: 0x3498db }, setFooter: vitest_1.vi.fn().mockReturnThis() };
        mockItad.getDeals.mockResolvedValue(dealResult);
        mockItad.buildDealEmbed.mockReturnValue(mockEmbed);
        const interaction = mi({ commandName: "deal", game: "Hollow Knight" });
        await (0, gaming_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
        (0, vitest_1.expect)(mockItad.getDeals).toHaveBeenCalledWith("Hollow Knight");
        (0, vitest_1.expect)(mockItad.buildDealEmbed).toHaveBeenCalledWith(dealResult);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
    });
    (0, vitest_1.it)("affiche 'aucun résultat' quand getDeals retourne null", async () => {
        mockItad.getDeals.mockResolvedValue(null);
        const interaction = mi({ commandName: "deal", game: "FakeGame" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("Aucun résultat trouvé");
        (0, vitest_1.expect)(embeds[0].data.description).toContain("FakeGame");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xffaa00);
    });
    (0, vitest_1.it)("affiche 'aucun prix disponible' quand result.prices est vide", async () => {
        mockItad.getDeals.mockResolvedValue({ title: "RareGame", prices: [] });
        const interaction = mi({ commandName: "deal", game: "RareGame" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("aucun prix disponible");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xffaa00);
    });
    (0, vitest_1.it)("affiche une erreur quand getDeals lève une exception", async () => {
        mockItad.getDeals.mockRejectedValue(new Error("API rate limit"));
        const interaction = mi({ commandName: "deal", game: "AnyGame" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("Impossible de récupérer");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xff3344);
        (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalled();
    });
    (0, vitest_1.it)("affiche une erreur quand buildDealEmbed lève une exception", async () => {
        mockItad.getDeals.mockResolvedValue({ title: "CrashGame", prices: [{ shop: "Steam", price: "0€", url: "#" }] });
        mockItad.buildDealEmbed.mockImplementation(() => { throw new Error("Embed build failed"); });
        const interaction = mi({ commandName: "deal", game: "CrashGame" });
        await (0, gaming_1.handleCommand)(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        (0, vitest_1.expect)(embeds[0].data.description).toContain("Impossible de récupérer");
        (0, vitest_1.expect)(embeds[0].data.color).toBe(0xff3344);
    });
});
//# sourceMappingURL=gaming.test.js.map