"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const discord_js_1 = require("discord.js");
// === Mocks hoisted ===
const mockPrisma = vitest_1.vi.hoisted(() => ({
    trackedGame: {
        findFirst: vitest_1.vi.fn(),
        findMany: vitest_1.vi.fn(),
        delete: vitest_1.vi.fn(),
        create: vitest_1.vi.fn(),
    },
}));
const mockLogger = vitest_1.vi.hoisted(() => ({
    info: vitest_1.vi.fn(),
    warn: vitest_1.vi.fn(),
    error: vitest_1.vi.fn(),
}));
const mockConfig = vitest_1.vi.hoisted(() => ({
    steamChannel: "123456789",
}));
const mockFindAppIdByName = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockGetLatestNews = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
// === Module mocks ===
vitest_1.vi.mock("../prisma", () => ({ default: mockPrisma }));
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
vitest_1.vi.mock("../config", () => ({ config: mockConfig }));
vitest_1.vi.mock("../services/steamNewsService", () => ({
    findAppIdByName: mockFindAppIdByName,
    getLatestNews: mockGetLatestNews,
}));
// Import the module under test AFTER mocks
const trackGame_1 = require("./trackGame");
// === Helpers ===
function mockInteraction(overrides = {}) {
    return {
        commandName: overrides.commandName ?? "track-game",
        options: {
            getString: vitest_1.vi.fn().mockReturnValue(overrides.getString ?? null),
            getFocused: overrides.getFocused
                ? vitest_1.vi.fn().mockReturnValue(overrides.getFocused())
                : vitest_1.vi.fn().mockReturnValue({ name: "", value: "", focused: false }),
            getSubcommand: vitest_1.vi.fn().mockReturnValue(null),
        },
        guildId: overrides.guildId ?? "guild-1",
        guild: { id: "guild-1", name: "Test Guild" },
        memberPermissions: { has: vitest_1.vi.fn().mockReturnValue(true) },
        member: overrides.member ?? { id: "user-1", displayName: "TestUser" },
        user: overrides.user ?? { id: "user-1", username: "testuser" },
        channelId: "channel-1",
        channel: { id: "channel-1", name: "general" },
        deferReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        editReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        reply: vitest_1.vi.fn().mockResolvedValue(undefined),
        followUp: vitest_1.vi.fn().mockResolvedValue(undefined),
        isAutocomplete: vitest_1.vi.fn().mockReturnValue(false),
        isChatInputCommand: vitest_1.vi.fn().mockReturnValue(true),
        client: {},
    };
}
function mockAutocompleteInteraction(focusedValue) {
    return {
        commandName: "untrack-game",
        options: {
            getFocused: vitest_1.vi.fn().mockReturnValue({
                name: "jeu",
                value: focusedValue,
                focused: true,
            }),
        },
        respond: vitest_1.vi.fn().mockResolvedValue(undefined),
        isAutocomplete: vitest_1.vi.fn().mockReturnValue(true),
        isChatInputCommand: vitest_1.vi.fn().mockReturnValue(true),
        guildId: "guild-1",
        member: { id: "user-1" },
        client: {},
    };
}
// === Setup ===
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
});
// ==================== Tests ====================
// ===========================================================================
(0, vitest_1.describe)("handleTrackGame", () => {
    (0, vitest_1.it)("ajoute un jeu trouvé et non tracké avec succès", async () => {
        mockFindAppIdByName.mockResolvedValue({
            appid: 12345,
            name: "Celeste",
            score: 950,
        });
        mockPrisma.trackedGame.findFirst.mockResolvedValue(null);
        mockGetLatestNews.mockResolvedValue({
            gid: "news-001",
            title: "Celeste - Mise à jour majeure",
            url: "https://store.steampowered.com/news/12345",
            date: new Date("2026-06-10"),
            content: "Nouveau contenu ajouté",
        });
        mockPrisma.trackedGame.create.mockResolvedValue({
            id: 1,
            appId: 12345,
            gameName: "Celeste",
            lastNewsDate: new Date("2026-06-10"),
        });
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "Celeste",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        (0, vitest_1.expect)(mockPrisma.trackedGame.create).toHaveBeenCalledWith({
            data: { appId: 12345, gameName: "Celeste", lastNewsDate: vitest_1.expect.any(Date) },
        });
        const editCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editCall.embeds).toHaveLength(1);
        const embed = editCall.embeds[0];
        (0, vitest_1.expect)(embed.data.title).toContain("Jeu ajouté");
        (0, vitest_1.expect)(embed.data.color).toBe(0x2a475e);
        (0, vitest_1.expect)(embed.data.fields).toHaveLength(4);
        (0, vitest_1.expect)(embed.data.fields[0].name).toBe("AppID");
        (0, vitest_1.expect)(embed.data.fields[0].value).toBe("12345");
        (0, vitest_1.expect)(embed.data.fields[1].name).toBe("Score de correspondance");
        (0, vitest_1.expect)(embed.data.fields[1].value).toBe("950/1000");
        (0, vitest_1.expect)(embed.data.fields[2].name).toBe("Dernière news");
        (0, vitest_1.expect)(embed.data.fields[2].value).toContain("Celeste - Mise à jour majeure");
    });
    (0, vitest_1.it)("répond avec une erreur quand le jeu est introuvable dans Steam", async () => {
        mockFindAppIdByName.mockResolvedValue(null);
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "JeuInconnu",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith({
            content: vitest_1.expect.stringContaining("JeuInconnu"),
        });
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith({
            content: vitest_1.expect.stringContaining("introuvable"),
        });
        (0, vitest_1.expect)(mockPrisma.trackedGame.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("avertit quand le jeu est déjà surveillé", async () => {
        mockFindAppIdByName.mockResolvedValue({
            appid: 12345,
            name: "Celeste",
            score: 950,
        });
        mockPrisma.trackedGame.findFirst.mockResolvedValue({
            id: 1,
            appId: 12345,
            gameName: "Celeste",
            lastNewsDate: new Date("2026-05-01"),
        });
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "Celeste",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith({
            content: vitest_1.expect.stringContaining("déjà surveillé"),
        });
        (0, vitest_1.expect)(mockPrisma.trackedGame.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("gère une erreur de l'API Steam sans crasher", async () => {
        mockFindAppIdByName.mockRejectedValue(new Error("Steam API down"));
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "Celeste",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith("[TrackGame] Erreur:", "Error: Steam API down");
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith({
            content: vitest_1.expect.stringContaining("Une erreur est survenue"),
        });
    });
    (0, vitest_1.it)("gère une erreur Prisma lors de la création sans crasher", async () => {
        mockFindAppIdByName.mockResolvedValue({
            appid: 12345,
            name: "Celeste",
            score: 950,
        });
        mockPrisma.trackedGame.findFirst.mockResolvedValue(null);
        mockGetLatestNews.mockResolvedValue(null);
        mockPrisma.trackedGame.create.mockRejectedValue(new Error("DB constraint"));
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "Celeste",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith("[TrackGame] Erreur:", "Error: DB constraint");
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith({
            content: vitest_1.expect.stringContaining("Une erreur est survenue"),
        });
    });
    (0, vitest_1.it)("ajoute un jeu sans news récente (fallback date)", async () => {
        mockFindAppIdByName.mockResolvedValue({
            appid: 12345,
            name: "Celeste",
            score: 950,
        });
        mockPrisma.trackedGame.findFirst.mockResolvedValue(null);
        mockGetLatestNews.mockResolvedValue(null); // pas de news
        mockPrisma.trackedGame.create.mockResolvedValue({
            id: 1,
            appId: 12345,
            gameName: "Celeste",
            lastNewsDate: new Date(),
        });
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "Celeste",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        const editCall = interaction.editReply.mock.calls[0][0];
        const embed = editCall.embeds[0];
        const derniereNews = embed.data.fields[2].value;
        (0, vitest_1.expect)(derniereNews).toBe("Aucune news détectée");
        (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("ajouté à la surveillance"));
    });
    (0, vitest_1.it)("trimme les espaces du nom du jeu", async () => {
        mockFindAppIdByName.mockResolvedValue({
            appid: 12345,
            name: "Celeste",
            score: 950,
        });
        mockPrisma.trackedGame.findFirst.mockResolvedValue(null);
        mockGetLatestNews.mockResolvedValue(null);
        mockPrisma.trackedGame.create.mockResolvedValue({ id: 1 });
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "  Celeste  ",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        // findAppIdByName doit être appelé avec la valeur trimée
        (0, vitest_1.expect)(mockFindAppIdByName).toHaveBeenCalledWith("Celeste");
    });
});
(0, vitest_1.describe)("handleUntrackGame", () => {
    (0, vitest_1.it)("supprime un jeu tracke et renvoie un embed de confirmation", async () => {
        const gameName = "Counter-Strike 2";
        const tracked = {
            id: 42,
            appId: 730,
            gameName,
            lastNewsGid: "gid-old",
            lastNewsDate: new Date("2026-06-01"),
        };
        mockPrisma.trackedGame.findFirst.mockResolvedValue(tracked);
        mockPrisma.trackedGame.delete.mockResolvedValue(tracked);
        const interaction = mockInteraction({
            commandName: "untrack-game",
            getString: gameName,
        });
        await (0, trackGame_1.handleCommand)(interaction);
        // Defer en ephemeral
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        // Cherche le jeu par nom
        (0, vitest_1.expect)(mockPrisma.trackedGame.findFirst).toHaveBeenCalledWith({
            where: { gameName },
        });
        // Supprime
        (0, vitest_1.expect)(mockPrisma.trackedGame.delete).toHaveBeenCalledWith({
            where: { id: 42 },
        });
        // Repond avec un embed
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
        const editCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editCall.embeds).toBeDefined();
        (0, vitest_1.expect)(editCall.embeds.length).toBe(1);
        const embed = editCall.embeds[0];
        (0, vitest_1.expect)(embed.data.color).toBe(0xff4444);
        (0, vitest_1.expect)(embed.data.title).toBe("\uD83D\uDDD1\uFE0F Jeu retir\u00E9 de la surveillance");
        (0, vitest_1.expect)(embed.data.description).toContain("Counter-Strike 2");
        (0, vitest_1.expect)(embed.data.description).toContain("AppID 730");
        (0, vitest_1.expect)(embed.data.fields).toBeDefined();
        // Log info
        (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Counter-Strike 2 (730) retiré de la surveillance"));
    });
    (0, vitest_1.it)("renvoie une erreur si le jeu n'est pas trouve dans la BDD", async () => {
        const gameName = "Jeu Inexistant";
        mockPrisma.trackedGame.findFirst.mockResolvedValue(null);
        const interaction = mockInteraction({
            commandName: "untrack-game",
            getString: gameName,
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.trackedGame.delete).not.toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith({
            content: vitest_1.expect.stringContaining(gameName),
        });
    });
    (0, vitest_1.it)("gère les erreurs Prisma (catch) et loggue", async () => {
        const gameName = "Test Game";
        mockPrisma.trackedGame.findFirst.mockResolvedValue({
            id: 1,
            appId: 999,
            gameName,
        });
        mockPrisma.trackedGame.delete.mockRejectedValue(new Error("DB down"));
        const interaction = mockInteraction({
            commandName: "untrack-game",
            getString: gameName,
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith("[TrackGame] Erreur untrack:", vitest_1.expect.any(String));
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            content: vitest_1.expect.any(String),
        }));
    });
});
(0, vitest_1.describe)("handleListTracked", () => {
    (0, vitest_1.it)("affiche la liste des jeux trackes avec leurs infos", async () => {
        const games = [
            {
                id: 1,
                appId: 730,
                gameName: "Counter-Strike 2",
                lastNewsDate: new Date("2026-06-10"),
                lastNewsGid: "gid-1",
                guildId: "guild-1",
                addedBy: "user-1",
                addedAt: new Date("2026-01-01"),
                lastNewsTitle: "Update",
                lastNewsUrl: "https://...",
                lastCheckAt: new Date("2026-06-12"),
                active: true,
            },
            {
                id: 2,
                appId: 570,
                gameName: "Dota 2",
                lastNewsDate: new Date("2026-06-11"),
                lastNewsGid: "gid-2",
                guildId: "guild-1",
                addedBy: "user-1",
                addedAt: new Date("2026-02-01"),
                lastNewsTitle: "Patch",
                lastNewsUrl: "https://...",
                lastCheckAt: new Date("2026-06-12"),
                active: true,
            },
        ];
        mockPrisma.trackedGame.findMany.mockResolvedValue(games);
        const interaction = mockInteraction({
            commandName: "list-tracked",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        // Defer ephemeral
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        // fetch les jeux tries par nom
        (0, vitest_1.expect)(mockPrisma.trackedGame.findMany).toHaveBeenCalledWith({
            orderBy: { gameName: "asc" },
        });
        // Repond avec embed
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
        const editCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editCall.embeds).toBeDefined();
        (0, vitest_1.expect)(editCall.embeds.length).toBe(1);
        const embed = editCall.embeds[0];
        (0, vitest_1.expect)(embed.data.title).toContain("surveill");
        (0, vitest_1.expect)(embed.data.title).toContain("2");
        // La description contient les deux jeux
        (0, vitest_1.expect)(embed.data.description).toContain("Counter-Strike 2");
        (0, vitest_1.expect)(embed.data.description).toContain("AppID 730");
        (0, vitest_1.expect)(embed.data.description).toContain("Dota 2");
        (0, vitest_1.expect)(embed.data.description).toContain("AppID 570");
        // Contient l'info du salon de publication
        const hasChannelField = embed.data.fields?.some((f) => f.value && f.value.includes("123456789"));
        (0, vitest_1.expect)(hasChannelField).toBe(true);
    });
    (0, vitest_1.it)("affiche un message specifique quand aucun jeu n'est tracke", async () => {
        mockPrisma.trackedGame.findMany.mockResolvedValue([]);
        const interaction = mockInteraction({
            commandName: "list-tracked",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            content: vitest_1.expect.any(String),
        }));
        const editCall = interaction.editReply.mock.calls[0][0];
        // Ne doit pas contenir d'embeds
        (0, vitest_1.expect)(editCall.embeds).toBeUndefined();
        // Le message doit indiquer l'absence de jeux
        (0, vitest_1.expect)(editCall.content).toContain("Aucun jeu n'est actuellement surveill");
    });
    (0, vitest_1.it)("gère les erreurs Prisma et loggue", async () => {
        mockPrisma.trackedGame.findMany.mockRejectedValue(new Error("DB timeout"));
        const interaction = mockInteraction({
            commandName: "list-tracked",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith("[TrackGame] Erreur list:", vitest_1.expect.any(String));
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            content: vitest_1.expect.any(String),
        }));
    });
    (0, vitest_1.it)("tronque la description si elle depasse 4096 caracteres", async () => {
        // Cree 200 jeux avec des noms longs pour depasser la limite
        const games = Array.from({ length: 200 }, (_, i) => ({
            id: i + 1,
            appId: 1000 + i,
            gameName: `Very Long Game Name Number ${i} With Extra Padding`,
            lastNewsDate: new Date("2026-06-01"),
            lastNewsGid: null,
            guildId: "guild-1",
            addedBy: "user-1",
            addedAt: new Date(),
            lastNewsTitle: null,
            lastNewsUrl: null,
            lastCheckAt: null,
            active: true,
        }));
        mockPrisma.trackedGame.findMany.mockResolvedValue(games);
        const interaction = mockInteraction({
            commandName: "list-tracked",
        });
        await (0, trackGame_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
        const editCall = interaction.editReply.mock.calls[0][0];
        const embed = editCall.embeds[0];
        // Verifie que la description est tronquee a 4096 caracteres max
        (0, vitest_1.expect)(embed.data.description.length).toBeLessThanOrEqual(4096);
    });
});
(0, vitest_1.describe)("handleAutocomplete (untrack-game)", () => {
    (0, vitest_1.it)("retourne les suggestions de jeux filtrées par l'input utilisateur", async () => {
        const games = [
            { id: 1, gameName: "Counter-Strike 2", appId: 730 },
            { id: 2, gameName: "Counter-Strike: Source", appId: 240 },
            { id: 3, gameName: "Dota 2", appId: 570 },
        ];
        mockPrisma.trackedGame.findMany.mockResolvedValue(games);
        const interaction = mockAutocompleteInteraction("counter");
        await (0, trackGame_1.handleAutocomplete)(interaction);
        (0, vitest_1.expect)(mockPrisma.trackedGame.findMany).toHaveBeenCalledWith({
            orderBy: { gameName: "asc" },
        });
        (0, vitest_1.expect)(interaction.respond).toHaveBeenCalled();
        const respondCall = interaction.respond.mock.calls[0][0];
        // 2 resultats pour "counter"
        (0, vitest_1.expect)(respondCall.length).toBe(2);
        (0, vitest_1.expect)(respondCall[0]).toEqual(vitest_1.expect.objectContaining({
            name: vitest_1.expect.stringContaining("Counter"),
            value: vitest_1.expect.stringContaining("Counter"),
        }));
    });
    (0, vitest_1.it)("retourne un tableau vide quand aucun jeu ne correspond", async () => {
        mockPrisma.trackedGame.findMany.mockResolvedValue([]);
        const interaction = mockAutocompleteInteraction("zzzz");
        await (0, trackGame_1.handleAutocomplete)(interaction);
        (0, vitest_1.expect)(mockPrisma.trackedGame.findMany).toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.respond).toHaveBeenCalledWith([]);
    });
    (0, vitest_1.it)("filtre case-insensitive", async () => {
        const games = [
            { id: 1, gameName: "DOTA 2", appId: 570 },
            { id: 2, gameName: "dota underlords", appId: 999 },
        ];
        mockPrisma.trackedGame.findMany.mockResolvedValue(games);
        const interaction = mockAutocompleteInteraction("Dota");
        await (0, trackGame_1.handleAutocomplete)(interaction);
        (0, vitest_1.expect)(mockPrisma.trackedGame.findMany).toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.respond).toHaveBeenCalled();
        const respondCall = interaction.respond.mock.calls[0][0];
        (0, vitest_1.expect)(respondCall.length).toBe(2);
    });
});
//# sourceMappingURL=trackGame.test.js.map