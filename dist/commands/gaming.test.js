import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const { mockLogger, mockItad } = vi.hoisted(() => ({
    mockLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    mockItad: {
        getDeals: vi.fn(),
        buildDealEmbed: vi.fn(),
    },
}));
vi.mock("../utils/logger", () => ({ default: mockLogger }));
vi.mock("../services/itad", () => mockItad);
import { handleCommand } from "./gaming.js";
function mi(o = {}) {
    return {
        commandName: o.commandName ?? "game-status",
        options: {
            getString: vi.fn((name) => {
                if (name === "jeu")
                    return o.game ?? null;
                return null;
            }),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
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
describe("handleGameStatus (via handleCommand)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });
    describe("unknown game", () => {
        it("repond avec un embed d'erreur pour un jeu non reconnu", async () => {
            const interaction = mi({ game: "jeu_invente" });
            await handleCommand(interaction);
            expect(interaction.deferReply).toHaveBeenCalled();
            expect(interaction.editReply).toHaveBeenCalledTimes(1);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds).toHaveLength(1);
            expect(embeds[0].data.description).toContain("non reconnu");
            expect(embeds[0].data.color).toBe(0xff3344);
        });
    });
    describe("missing game option", () => {
        it("repond avec une erreur quand l'option jeu est null", async () => {
            const interaction = mi({ game: null });
            await handleCommand(interaction);
            expect(interaction.deferReply).toHaveBeenCalled();
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.description).toContain("non reconnu");
        });
    });
    describe("operational services", () => {
        it.each([
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
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
            });
            vi.stubGlobal("fetch", fetchMock);
            const interaction = mi({ game });
            await handleCommand(interaction);
            expect(interaction.deferReply).toHaveBeenCalled();
            expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ signal: expect.any(AbortSignal) }));
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds).toHaveLength(1);
            expect(embeds[0].data.description).toContain("Opérationnel");
            expect(embeds[0].data.description).toContain("Aucun problème signalé");
            expect(embeds[0].data.color).toBe(0x53fc18);
            expect(embeds[0].data.fields).toContainEqual(expect.objectContaining({ name: expect.stringContaining("Page statut") }));
        });
    });
    describe("degraded services", () => {
        it("affiche 'Perturbations possibles' quand 503", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
            }));
            const interaction = mi({ game: "steam" });
            await handleCommand(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.description).toContain("Perturbations possibles");
            expect(embeds[0].data.color).toBe(0xffaa00);
        });
        it("affiche 'Perturbations possibles' sur un 404", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            }));
            const interaction = mi({ game: "fortnite" });
            await handleCommand(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.description).toContain("Perturbations possibles");
            expect(embeds[0].data.color).toBe(0xffaa00);
        });
    });
    describe("network errors", () => {
        it("affiche 'Statut inconnu' quand fetch lève une exception", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
            const interaction = mi({ game: "psn" });
            await handleCommand(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.description).toContain("Statut inconnu");
            expect(embeds[0].data.description).toContain("Impossible de contacter le service");
            expect(embeds[0].data.color).toBe(0xffaa00);
        });
        it("survit à une erreur AbortError", async () => {
            const abortError = new Error("The operation was aborted");
            abortError.name = "AbortError";
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
            const interaction = mi({ game: "riot" });
            await handleCommand(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.description).toContain("Statut inconnu");
        });
        it("survit quand fetch renvoie un objet sans ok", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                status: 200,
            }));
            const interaction = mi({ game: "xbox" });
            await handleCommand(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.description).toContain("Opérationnel");
        });
    });
    describe("embed structure", () => {
        it("inclut le titre avec emoji et nom du jeu", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
            const interaction = mi({ game: "fortnite" });
            await handleCommand(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.title).toContain("Fortnite");
            expect(embeds[0].data.footer).toBeDefined();
            expect(embeds[0].data.timestamp).toBeDefined();
        });
        it("inclut le lien page statut même en erreur", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
            const interaction = mi({ game: "roblox" });
            await handleCommand(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.fields).toContainEqual(expect.objectContaining({
                name: expect.stringContaining("Page statut"),
                value: "https://status.roblox.com/",
            }));
        });
    });
    describe("nintendo special case", () => {
        it("gère Nintendo avec même URL page et status", async () => {
            const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
            vi.stubGlobal("fetch", fetchMock);
            const interaction = mi({ game: "nintendo" });
            await handleCommand(interaction);
            const embeds = getEditReplyEmbeds(interaction);
            expect(embeds[0].data.title).toContain("Nintendo");
            expect(fetchMock).toHaveBeenCalledWith("https://www.nintendo.com/fr-fr/", expect.objectContaining({ signal: expect.any(AbortSignal) }));
        });
    });
});
// ═══════════════════════════════════════════════════════════════
// handleFreeGames
// ═══════════════════════════════════════════════════════════════
describe("handleFreeGames (via handleCommand)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });
    function epicResponse(freeGames) {
        return {
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
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
    it("affiche un jeu gratuit avec tous les champs", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(epicResponse([{ title: "Among Us", originalPrice: "3,99€", endDate: "2026-06-20T00:00:00.000Z" }])));
        const interaction = mi({ commandName: "free-games" });
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalled();
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds).toHaveLength(1);
        expect(embeds[0].data.title).toContain("Among Us");
        expect(embeds[0].data.title).toContain("GRATUIT");
        expect(embeds[0].data.color).toBe(0x00f0ff);
        expect(embeds[0].data.fields).toContainEqual(expect.objectContaining({ name: "💰 Prix original", value: "3,99€" }));
        expect(embeds[0].data.fields).toContainEqual(expect.objectContaining({ name: "⏰ Fin de l'offre" }));
        expect(embeds[0].data.footer).toBeDefined();
        expect(embeds[0].data.timestamp).toBeDefined();
    });
    it("ajoute un champ 'Autres' quand plusieurs jeux gratuits", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(epicResponse([
            { title: "Game A" },
            { title: "Game B" },
            { title: "Game C" },
        ])));
        const interaction = mi({ commandName: "free-games" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.fields).toContainEqual(expect.objectContaining({ name: "📦 Autres", value: "2 autre(s) jeu(x) gratuit(s)" }));
    });
    it("n'ajoute pas le champ 'Autres' pour un seul jeu", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(epicResponse([{ title: "Only Game" }])));
        const interaction = mi({ commandName: "free-games" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        const autresField = embeds[0].data.fields?.find((f) => f.name === "📦 Autres");
        expect(autresField).toBeUndefined();
    });
    it("affiche 'aucun jeu gratuit' quand la liste est vide", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(epicResponse([])));
        const interaction = mi({ commandName: "free-games" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("Aucun jeu gratuit");
        expect(embeds[0].data.color).toBe(0xffaa00);
    });
    it("affiche une erreur quand l'API échoue (HTTP error)", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        const interaction = mi({ commandName: "free-games" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("Impossible de récupérer");
        expect(embeds[0].data.color).toBe(0xff3344);
    });
    it("affiche une erreur quand fetch lève une exception", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));
        const interaction = mi({ commandName: "free-games" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("Impossible de récupérer");
        expect(embeds[0].data.color).toBe(0xff3344);
    });
    it("gère les données partielles (pas de description, pas de prix)", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
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
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.title).toContain("Bare Game");
    });
});
// ═══════════════════════════════════════════════════════════════
// handlePatchNotes
// ═══════════════════════════════════════════════════════════════
describe("handlePatchNotes (via handleCommand)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it.each([
        { game: "fortnite", name: "Fortnite", url: "https://www.fortnite.com/news" },
        { game: "helldivers2", name: "Helldivers 2", url: "https://store.steampowered.com/news/app/553850" },
        { game: "cod", name: "Call of Duty", url: "https://www.callofduty.com/fr/patchnotes" },
        { game: "gta", name: "GTA Online", url: "https://support.rockstargames.com/fr/categories/200013106" },
    ])("affiche les patch notes de $game", async ({ game, name, url }) => {
        const interaction = mi({ commandName: "patch-notes", game });
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalled();
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds).toHaveLength(1);
        expect(embeds[0].data.title).toContain(name);
        expect(embeds[0].data.description).toContain(url);
        expect(embeds[0].data.color).toBe(0x2f3136);
    });
    it("affiche une erreur pour un jeu non supporté", async () => {
        const interaction = mi({ commandName: "patch-notes", game: "minecraft" });
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalled();
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("non reconnu");
        expect(embeds[0].data.color).toBe(0xff3344);
    });
    it("affiche une erreur pour une option jeu null", async () => {
        const interaction = mi({ commandName: "patch-notes", game: null });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("non reconnu");
        expect(embeds[0].data.color).toBe(0xff3344);
    });
});
// ═══════════════════════════════════════════════════════════════
// handleDeal
// ═══════════════════════════════════════════════════════════════
describe("handleDeal (via handleCommand)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockItad.getDeals.mockResolvedValue(null);
        mockItad.buildDealEmbed.mockReturnValue({});
    });
    it("appelle getDeals avec le nom du jeu et buildDealEmbed avec le résultat", async () => {
        const dealResult = {
            title: "Hollow Knight",
            prices: [
                { shop: "Steam", price: "14,99€", url: "https://store.steampowered.com/app/367520" },
            ],
        };
        const mockEmbed = { data: { title: "💰 Hollow Knight", color: 0x3498db }, setFooter: vi.fn().mockReturnThis() };
        mockItad.getDeals.mockResolvedValue(dealResult);
        mockItad.buildDealEmbed.mockReturnValue(mockEmbed);
        const interaction = mi({ commandName: "deal", game: "Hollow Knight" });
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalled();
        expect(mockItad.getDeals).toHaveBeenCalledWith("Hollow Knight");
        expect(mockItad.buildDealEmbed).toHaveBeenCalledWith(dealResult);
        expect(interaction.editReply).toHaveBeenCalled();
    });
    it("affiche 'aucun résultat' quand getDeals retourne null", async () => {
        mockItad.getDeals.mockResolvedValue(null);
        const interaction = mi({ commandName: "deal", game: "FakeGame" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("Aucun résultat trouvé");
        expect(embeds[0].data.description).toContain("FakeGame");
        expect(embeds[0].data.color).toBe(0xffaa00);
    });
    it("affiche 'aucun prix disponible' quand result.prices est vide", async () => {
        mockItad.getDeals.mockResolvedValue({ title: "RareGame", prices: [] });
        const interaction = mi({ commandName: "deal", game: "RareGame" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("aucun prix disponible");
        expect(embeds[0].data.color).toBe(0xffaa00);
    });
    it("affiche une erreur quand getDeals lève une exception", async () => {
        mockItad.getDeals.mockRejectedValue(new Error("API rate limit"));
        const interaction = mi({ commandName: "deal", game: "AnyGame" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("Impossible de récupérer");
        expect(embeds[0].data.color).toBe(0xff3344);
        expect(mockLogger.error).toHaveBeenCalled();
    });
    it("affiche une erreur quand buildDealEmbed lève une exception", async () => {
        mockItad.getDeals.mockResolvedValue({ title: "CrashGame", prices: [{ shop: "Steam", price: "0€", url: "#" }] });
        mockItad.buildDealEmbed.mockImplementation(() => { throw new Error("Embed build failed"); });
        const interaction = mi({ commandName: "deal", game: "CrashGame" });
        await handleCommand(interaction);
        const embeds = getEditReplyEmbeds(interaction);
        expect(embeds[0].data.description).toContain("Impossible de récupérer");
        expect(embeds[0].data.color).toBe(0xff3344);
    });
});
//# sourceMappingURL=gaming.test.js.map