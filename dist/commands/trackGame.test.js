import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageFlags } from "discord.js";
// === Mocks hoisted ===
const mockPrisma = vi.hoisted(() => ({
    trackedGame: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
    },
}));
const mockLogger = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));
const mockConfig = vi.hoisted(() => ({
    steamChannel: "123456789",
}));
const mockFindAppIdByName = vi.hoisted(() => vi.fn());
const mockGetLatestNews = vi.hoisted(() => vi.fn());
// === Module mocks ===
vi.mock("../prisma", () => ({ default: mockPrisma }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));
vi.mock("../config", () => ({ config: mockConfig }));
vi.mock("../services/steamNewsService", () => ({
    findAppIdByName: mockFindAppIdByName,
    getLatestNews: mockGetLatestNews,
}));
// Import the module under test AFTER mocks
import { handleCommand as handleTrackGameCommand, handleAutocomplete as handleTrackGameAutocomplete, } from "./trackGame.js";
// === Helpers ===
function mockInteraction(overrides = {}) {
    return {
        commandName: overrides.commandName ?? "track-game",
        options: {
            getString: vi.fn().mockReturnValue(overrides.getString ?? null),
            getFocused: overrides.getFocused
                ? vi.fn().mockReturnValue(overrides.getFocused())
                : vi.fn().mockReturnValue({ name: "", value: "", focused: false }),
            getSubcommand: vi.fn().mockReturnValue(null),
        },
        guildId: overrides.guildId ?? "guild-1",
        guild: { id: "guild-1", name: "Test Guild" },
        memberPermissions: { has: vi.fn().mockReturnValue(true) },
        member: overrides.member ?? { id: "user-1", displayName: "TestUser" },
        user: overrides.user ?? { id: "user-1", username: "testuser" },
        channelId: "channel-1",
        channel: { id: "channel-1", name: "general" },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        followUp: vi.fn().mockResolvedValue(undefined),
        isAutocomplete: vi.fn().mockReturnValue(false),
        isChatInputCommand: vi.fn().mockReturnValue(true),
        client: {},
    };
}
function mockAutocompleteInteraction(focusedValue) {
    return {
        commandName: "untrack-game",
        options: {
            getFocused: vi.fn().mockReturnValue({
                name: "jeu",
                value: focusedValue,
                focused: true,
            }),
        },
        respond: vi.fn().mockResolvedValue(undefined),
        isAutocomplete: vi.fn().mockReturnValue(true),
        isChatInputCommand: vi.fn().mockReturnValue(true),
        guildId: "guild-1",
        member: { id: "user-1" },
        client: {},
    };
}
// === Setup ===
beforeEach(() => {
    vi.clearAllMocks();
});
// ==================== Tests ====================
// ===========================================================================
describe("handleTrackGame", () => {
    it("ajoute un jeu trouvé et non tracké avec succès", async () => {
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
        await handleTrackGameCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({
            flags: [MessageFlags.Ephemeral],
        });
        expect(mockPrisma.trackedGame.create).toHaveBeenCalledWith({
            data: { appId: 12345, gameName: "Celeste", lastNewsDate: expect.any(Date) },
        });
        const editCall = interaction.editReply.mock.calls[0][0];
        expect(editCall.embeds).toHaveLength(1);
        const embed = editCall.embeds[0];
        expect(embed.data.title).toContain("Jeu ajouté");
        expect(embed.data.color).toBe(0x2a475e);
        expect(embed.data.fields).toHaveLength(4);
        expect(embed.data.fields[0].name).toBe("AppID");
        expect(embed.data.fields[0].value).toBe("12345");
        expect(embed.data.fields[1].name).toBe("Score de correspondance");
        expect(embed.data.fields[1].value).toBe("950/1000");
        expect(embed.data.fields[2].name).toBe("Dernière news");
        expect(embed.data.fields[2].value).toContain("Celeste - Mise à jour majeure");
    });
    it("répond avec une erreur quand le jeu est introuvable dans Steam", async () => {
        mockFindAppIdByName.mockResolvedValue(null);
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "JeuInconnu",
        });
        await handleTrackGameCommand(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining("JeuInconnu"),
        });
        expect(interaction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining("introuvable"),
        });
        expect(mockPrisma.trackedGame.create).not.toHaveBeenCalled();
    });
    it("avertit quand le jeu est déjà surveillé", async () => {
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
        await handleTrackGameCommand(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining("déjà surveillé"),
        });
        expect(mockPrisma.trackedGame.create).not.toHaveBeenCalled();
    });
    it("gère une erreur de l'API Steam sans crasher", async () => {
        mockFindAppIdByName.mockRejectedValue(new Error("Steam API down"));
        const interaction = mockInteraction({
            commandName: "track-game",
            getString: "Celeste",
        });
        await handleTrackGameCommand(interaction);
        expect(mockLogger.error).toHaveBeenCalledWith("[TrackGame] Erreur:", "Error: Steam API down");
        expect(interaction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining("Une erreur est survenue"),
        });
    });
    it("gère une erreur Prisma lors de la création sans crasher", async () => {
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
        await handleTrackGameCommand(interaction);
        expect(mockLogger.error).toHaveBeenCalledWith("[TrackGame] Erreur:", "Error: DB constraint");
        expect(interaction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining("Une erreur est survenue"),
        });
    });
    it("ajoute un jeu sans news récente (fallback date)", async () => {
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
        await handleTrackGameCommand(interaction);
        const editCall = interaction.editReply.mock.calls[0][0];
        const embed = editCall.embeds[0];
        const derniereNews = embed.data.fields[2].value;
        expect(derniereNews).toBe("Aucune news détectée");
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("ajouté à la surveillance"));
    });
    it("trimme les espaces du nom du jeu", async () => {
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
        await handleTrackGameCommand(interaction);
        // findAppIdByName doit être appelé avec la valeur trimée
        expect(mockFindAppIdByName).toHaveBeenCalledWith("Celeste");
    });
});
describe("handleUntrackGame", () => {
    it("supprime un jeu tracke et renvoie un embed de confirmation", async () => {
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
        await handleTrackGameCommand(interaction);
        // Defer en ephemeral
        expect(interaction.deferReply).toHaveBeenCalledWith({
            flags: [MessageFlags.Ephemeral],
        });
        // Cherche le jeu par nom
        expect(mockPrisma.trackedGame.findFirst).toHaveBeenCalledWith({
            where: { gameName },
        });
        // Supprime
        expect(mockPrisma.trackedGame.delete).toHaveBeenCalledWith({
            where: { id: 42 },
        });
        // Repond avec un embed
        expect(interaction.editReply).toHaveBeenCalled();
        const editCall = interaction.editReply.mock.calls[0][0];
        expect(editCall.embeds).toBeDefined();
        expect(editCall.embeds.length).toBe(1);
        const embed = editCall.embeds[0];
        expect(embed.data.color).toBe(0xff4444);
        expect(embed.data.title).toBe("\uD83D\uDDD1\uFE0F Jeu retir\u00E9 de la surveillance");
        expect(embed.data.description).toContain("Counter-Strike 2");
        expect(embed.data.description).toContain("AppID 730");
        expect(embed.data.fields).toBeDefined();
        // Log info
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Counter-Strike 2 (730) retiré de la surveillance"));
    });
    it("renvoie une erreur si le jeu n'est pas trouve dans la BDD", async () => {
        const gameName = "Jeu Inexistant";
        mockPrisma.trackedGame.findFirst.mockResolvedValue(null);
        const interaction = mockInteraction({
            commandName: "untrack-game",
            getString: gameName,
        });
        await handleTrackGameCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalled();
        expect(mockPrisma.trackedGame.delete).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining(gameName),
        });
    });
    it("gère les erreurs Prisma (catch) et loggue", async () => {
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
        await handleTrackGameCommand(interaction);
        expect(mockLogger.error).toHaveBeenCalledWith("[TrackGame] Erreur untrack:", expect.any(String));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.any(String),
        }));
    });
});
describe("handleListTracked", () => {
    it("affiche la liste des jeux trackes avec leurs infos", async () => {
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
        await handleTrackGameCommand(interaction);
        // Defer ephemeral
        expect(interaction.deferReply).toHaveBeenCalledWith({
            flags: [MessageFlags.Ephemeral],
        });
        // fetch les jeux tries par nom
        expect(mockPrisma.trackedGame.findMany).toHaveBeenCalledWith({
            orderBy: { gameName: "asc" },
        });
        // Repond avec embed
        expect(interaction.editReply).toHaveBeenCalled();
        const editCall = interaction.editReply.mock.calls[0][0];
        expect(editCall.embeds).toBeDefined();
        expect(editCall.embeds.length).toBe(1);
        const embed = editCall.embeds[0];
        expect(embed.data.title).toContain("surveill");
        expect(embed.data.title).toContain("2");
        // La description contient les deux jeux
        expect(embed.data.description).toContain("Counter-Strike 2");
        expect(embed.data.description).toContain("AppID 730");
        expect(embed.data.description).toContain("Dota 2");
        expect(embed.data.description).toContain("AppID 570");
        // Contient l'info du salon de publication
        const hasChannelField = embed.data.fields?.some((f) => f.value && f.value.includes("123456789"));
        expect(hasChannelField).toBe(true);
    });
    it("affiche un message specifique quand aucun jeu n'est tracke", async () => {
        mockPrisma.trackedGame.findMany.mockResolvedValue([]);
        const interaction = mockInteraction({
            commandName: "list-tracked",
        });
        await handleTrackGameCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.any(String),
        }));
        const editCall = interaction.editReply.mock.calls[0][0];
        // Ne doit pas contenir d'embeds
        expect(editCall.embeds).toBeUndefined();
        // Le message doit indiquer l'absence de jeux
        expect(editCall.content).toContain("Aucun jeu n'est actuellement surveill");
    });
    it("gère les erreurs Prisma et loggue", async () => {
        mockPrisma.trackedGame.findMany.mockRejectedValue(new Error("DB timeout"));
        const interaction = mockInteraction({
            commandName: "list-tracked",
        });
        await handleTrackGameCommand(interaction);
        expect(mockLogger.error).toHaveBeenCalledWith("[TrackGame] Erreur list:", expect.any(String));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.any(String),
        }));
    });
    it("tronque la description si elle depasse 4096 caracteres", async () => {
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
        await handleTrackGameCommand(interaction);
        expect(interaction.editReply).toHaveBeenCalled();
        const editCall = interaction.editReply.mock.calls[0][0];
        const embed = editCall.embeds[0];
        // Verifie que la description est tronquee a 4096 caracteres max
        expect(embed.data.description.length).toBeLessThanOrEqual(4096);
    });
});
describe("handleAutocomplete (untrack-game)", () => {
    it("retourne les suggestions de jeux filtrées par l'input utilisateur", async () => {
        const games = [
            { id: 1, gameName: "Counter-Strike 2", appId: 730 },
            { id: 2, gameName: "Counter-Strike: Source", appId: 240 },
            { id: 3, gameName: "Dota 2", appId: 570 },
        ];
        mockPrisma.trackedGame.findMany.mockResolvedValue(games);
        const interaction = mockAutocompleteInteraction("counter");
        await handleTrackGameAutocomplete(interaction);
        expect(mockPrisma.trackedGame.findMany).toHaveBeenCalledWith({
            orderBy: { gameName: "asc" },
        });
        expect(interaction.respond).toHaveBeenCalled();
        const respondCall = interaction.respond.mock.calls[0][0];
        // 2 resultats pour "counter"
        expect(respondCall.length).toBe(2);
        expect(respondCall[0]).toEqual(expect.objectContaining({
            name: expect.stringContaining("Counter"),
            value: expect.stringContaining("Counter"),
        }));
    });
    it("retourne un tableau vide quand aucun jeu ne correspond", async () => {
        mockPrisma.trackedGame.findMany.mockResolvedValue([]);
        const interaction = mockAutocompleteInteraction("zzzz");
        await handleTrackGameAutocomplete(interaction);
        expect(mockPrisma.trackedGame.findMany).toHaveBeenCalled();
        expect(interaction.respond).toHaveBeenCalledWith([]);
    });
    it("filtre case-insensitive", async () => {
        const games = [
            { id: 1, gameName: "DOTA 2", appId: 570 },
            { id: 2, gameName: "dota underlords", appId: 999 },
        ];
        mockPrisma.trackedGame.findMany.mockResolvedValue(games);
        const interaction = mockAutocompleteInteraction("Dota");
        await handleTrackGameAutocomplete(interaction);
        expect(mockPrisma.trackedGame.findMany).toHaveBeenCalled();
        expect(interaction.respond).toHaveBeenCalled();
        const respondCall = interaction.respond.mock.calls[0][0];
        expect(respondCall.length).toBe(2);
    });
});
//# sourceMappingURL=trackGame.test.js.map