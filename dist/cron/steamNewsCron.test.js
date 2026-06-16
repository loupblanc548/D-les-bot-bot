"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ─── vi.hoisted() - s'execute AVANT les imports, evite le hoisting classique ─
const { mockProcessedPatchNotesFindUnique, mockProcessedPatchNotesCreate, } = vitest_1.vi.hoisted(() => ({
    mockProcessedPatchNotesFindUnique: vitest_1.vi.fn(),
    mockProcessedPatchNotesCreate: vitest_1.vi.fn(),
}));
const { mockLoggerInfo, mockLoggerWarn, mockLoggerError } = vitest_1.vi.hoisted(() => ({
    mockLoggerInfo: vitest_1.vi.fn(),
    mockLoggerWarn: vitest_1.vi.fn(),
    mockLoggerError: vitest_1.vi.fn(),
}));
const { mockFetch } = vitest_1.vi.hoisted(() => ({
    mockFetch: vitest_1.vi.fn(),
}));
// ─── Mocks ──────────────────────────────────────────────────────────────────
vitest_1.vi.mock("../prisma", () => ({
    default: {
        processedPatchNotes: {
            findUnique: mockProcessedPatchNotesFindUnique,
            create: mockProcessedPatchNotesCreate,
        },
    },
}));
// Mock global fetch for rss2json API
// const mockFetch already defined via destructuring above
global.fetch = mockFetch;
vitest_1.vi.mock("../utils/logger", () => ({
    default: {
        info: mockLoggerInfo,
        warn: mockLoggerWarn,
        error: mockLoggerError,
    },
}));
vitest_1.vi.mock("discord.js", () => ({
    Client: vitest_1.vi.fn(),
    TextChannel: vitest_1.vi.fn(),
    EmbedBuilder: vitest_1.vi.fn().mockImplementation(function () {
        this.title = "";
        this.url = "";
        this.color = 0;
        this.author = null;
        this.description = "";
        this.fields = [];
        this.footer = null;
        this.timestamp = null;
        this.image = null;
        this.setTitle = vitest_1.vi.fn(function (t) { this.title = t; return this; });
        this.setURL = vitest_1.vi.fn(function (u) { this.url = u; return this; });
        this.setColor = vitest_1.vi.fn(function (c) { this.color = c; return this; });
        this.setAuthor = vitest_1.vi.fn(function (a) { this.author = a; return this; });
        this.setDescription = vitest_1.vi.fn(function (d) { this.description = d; return this; });
        this.addFields = vitest_1.vi.fn(function (...f) { this.fields.push(...f); return this; });
        this.setFooter = vitest_1.vi.fn(function (f) { this.footer = f; return this; });
        this.setTimestamp = vitest_1.vi.fn(function () { this.timestamp = new Date(); return this; });
        this.setImage = vitest_1.vi.fn(function (img) { this.image = img; return this; });
        return this;
    }),
}));
// ─── Import du module sous test (APRES les mocks) ──────────────────────────
const steamNewsCron_1 = require("./steamNewsCron");
// ─── Helpers ────────────────────────────────────────────────────────────────
function makeMockTextChannel(overrides = {}) {
    return {
        id: "channel-123",
        isTextBased: () => true,
        send: vitest_1.vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}
function makeMockClient(channelsMap = {}) {
    return {
        channels: {
            fetch: vitest_1.vi.fn().mockImplementation(async (id) => channelsMap[id] ?? null),
            cache: { get: vitest_1.vi.fn() },
        },
    };
}
function makeFeedItem(overrides = {}) {
    return {
        title: "PC Update 1.0 Patch Notes",
        link: "https://reddit.com/r/patchnotes/123",
        pubDate: new Date(Date.now() - 3600000).toISOString(),
        content: "Full patch notes content here",
        contentSnippet: "Patch notes summary",
        guid: "reddit-guid-123",
        isoDate: "2025-06-01T12:00:00.000Z",
        ...overrides,
    };
}
// ─── Setup / Teardown ───────────────────────────────────────────────────────
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    vitest_1.vi.useFakeTimers({ shouldAdvanceTime: true });
    // Configurer PLATFORM_CONFIGS pour que tous les channels soient actifs
    steamNewsCron_1.PLATFORM_CONFIGS.steam.channelId = "steam-epic-chan";
    steamNewsCron_1.PLATFORM_CONFIGS.playstation.channelId = "playstation-chan";
    steamNewsCron_1.PLATFORM_CONFIGS.xbox.channelId = "xbox-chan";
    steamNewsCron_1.PLATFORM_CONFIGS.nintendo.channelId = "nintendo-chan";
    // Arreter toute surveillance active
    (0, steamNewsCron_1.stopSteamNewsMonitoring)();
});
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.useRealTimers();
});
// ─── Tests: checkTrackedGames ───────────────────────────────────────────────
(0, vitest_1.describe)("checkTrackedGames", () => {
    (0, vitest_1.describe)("Gardes anti-crash", () => {
        (0, vitest_1.it)("retourne immediatement si aucun CHANNEL_ID n'est configure", async () => {
            // Desactiver tous les channels via PLATFORM_CONFIGS
            steamNewsCron_1.PLATFORM_CONFIGS.steam.channelId = undefined;
            steamNewsCron_1.PLATFORM_CONFIGS.playstation.channelId = undefined;
            steamNewsCron_1.PLATFORM_CONFIGS.xbox.channelId = undefined;
            steamNewsCron_1.PLATFORM_CONFIGS.nintendo.channelId = undefined;
            const client = makeMockClient();
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Aucun CHANNEL_ID configure"));
            (0, vitest_1.expect)(mockFetch).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("continue si au moins un CHANNEL_ID est configure", async () => {
            // Un seul channel actif
            steamNewsCron_1.PLATFORM_CONFIGS.playstation.channelId = undefined;
            steamNewsCron_1.PLATFORM_CONFIGS.xbox.channelId = undefined;
            steamNewsCron_1.PLATFORM_CONFIGS.nintendo.channelId = undefined;
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(mockFetch).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Verrouillage (isChecking)", () => {
        (0, vitest_1.it)("ignore les appels concurrents", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            // Premier appel : le RSS met du temps
            let resolveRss;
            const rssPromise = new Promise((resolve) => { resolveRss = resolve; });
            mockFetch.mockReturnValue(Promise.resolve({ ok: true, json: () => rssPromise }));
            const firstCall = (0, steamNewsCron_1.checkTrackedGames)(client);
            const secondCall = (0, steamNewsCron_1.checkTrackedGames)(client);
            // Resoudre le RSS
            resolveRss({ items: [] });
            await Promise.all([firstCall, secondCall]);
            (0, vitest_1.expect)(mockLoggerInfo).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Verification deja en cours"));
        });
    });
    (0, vitest_1.describe)("Echec du fetch RSS", () => {
        (0, vitest_1.it)("gere l'erreur RSS sans crasher", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            mockFetch.mockResolvedValue({ ok: false, status: 500 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Flux Reddit inaccessible"));
            (0, vitest_1.expect)(channel.send).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Flux vide", () => {
        (0, vitest_1.it)("ne fait rien si le flux est vide", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(mockLoggerInfo).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Aucun article trouve"));
            (0, vitest_1.expect)(channel.send).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Deduplication via ProcessedPatchNotes", () => {
        (0, vitest_1.it)("ignore les articles deja traites", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "PC patch v2" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue({ id: 1 }); // deja traite
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(channel.send).not.toHaveBeenCalled();
            (0, vitest_1.expect)(mockLoggerInfo).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Tous les articles sont deja connus"));
        });
        (0, vitest_1.it)("route les nouveaux articles", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "PC patch v3" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null); // nouveau
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(channel.send).toHaveBeenCalledTimes(1);
        });
    });
    (0, vitest_1.describe)("Routage plateforme unique", () => {
        (0, vitest_1.it)("route un patch note PC vers STEAM_EPIC_CHANNEL_ID", async () => {
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const psChannel = makeMockTextChannel({ id: "playstation-chan" });
            const client = makeMockClient({
                "steam-epic-chan": pcChannel,
                "playstation-chan": psChannel,
            });
            const item = makeFeedItem({ title: "[Steam] Game Update 2.0" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(pcChannel.send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(psChannel.send).not.toHaveBeenCalled();
            (0, vitest_1.expect)(pcChannel.send).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                content: vitest_1.expect.stringContaining("PC (Steam/Epic/GOG)"),
            }));
        });
        (0, vitest_1.it)("route un patch note PlayStation vers PLAYSTATION_CHANNEL_ID", async () => {
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const psChannel = makeMockTextChannel({ id: "playstation-chan" });
            const client = makeMockClient({
                "steam-epic-chan": pcChannel,
                "playstation-chan": psChannel,
            });
            const item = makeFeedItem({ title: "[PS5] Performance Patch" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(psChannel.send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(pcChannel.send).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("route un patch note Xbox vers XBOX_CHANNEL_ID", async () => {
            const xboxChannel = makeMockTextChannel({ id: "xbox-chan" });
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({
                "steam-epic-chan": pcChannel,
                "xbox-chan": xboxChannel,
            });
            const item = makeFeedItem({ title: "Xbox Series X Stability Update" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(xboxChannel.send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(pcChannel.send).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("route un patch note Nintendo vers NINTENDO_CHANNEL_ID", async () => {
            const ninChannel = makeMockTextChannel({ id: "nintendo-chan" });
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({
                "steam-epic-chan": pcChannel,
                "nintendo-chan": ninChannel,
            });
            const item = makeFeedItem({ title: "Nintendo Switch Update v3.1" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(ninChannel.send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(pcChannel.send).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Routage multi-plateforme", () => {
        (0, vitest_1.it)("envoie un patch note PC+PS5 dans les DEUX salons", async () => {
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const psChannel = makeMockTextChannel({ id: "playstation-chan" });
            const client = makeMockClient({
                "steam-epic-chan": pcChannel,
                "playstation-chan": psChannel,
            });
            const item = makeFeedItem({ title: "PC and PS5 Crossplay Patch Notes" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(pcChannel.send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(psChannel.send).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)("envoie un patch note toutes plateformes dans les 4 salons", async () => {
            const channels = {
                "steam-epic-chan": makeMockTextChannel({ id: "steam-epic-chan" }),
                "playstation-chan": makeMockTextChannel({ id: "playstation-chan" }),
                "xbox-chan": makeMockTextChannel({ id: "xbox-chan" }),
                "nintendo-chan": makeMockTextChannel({ id: "nintendo-chan" }),
            };
            const client = makeMockClient(channels);
            const item = makeFeedItem({
                title: "PC Steam Epic PS5 Xbox Series X Nintendo Switch Day One Patch",
            });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(channels["steam-epic-chan"].send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(channels["playstation-chan"].send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(channels["xbox-chan"].send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(channels["nintendo-chan"].send).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)("persiste UNE SEULE fois meme en multi-plateforme", async () => {
            const channels = {
                "steam-epic-chan": makeMockTextChannel({ id: "steam-epic-chan" }),
                "playstation-chan": makeMockTextChannel({ id: "playstation-chan" }),
            };
            const client = makeMockClient(channels);
            const item = makeFeedItem({ title: "PC and PS5 Patch" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(mockProcessedPatchNotesCreate).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(mockProcessedPatchNotesCreate).toHaveBeenCalledWith({
                data: { guid: item.guid, title: item.title.slice(0, 255) },
            });
        });
    });
    (0, vitest_1.describe)("Plateforme non detectee", () => {
        (0, vitest_1.it)("ne route pas un article sans mot-cle de plateforme", async () => {
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const psChannel = makeMockTextChannel({ id: "playstation-chan" });
            const client = makeMockClient({
                "steam-epic-chan": pcChannel,
                "playstation-chan": psChannel,
            });
            const item = makeFeedItem({ title: "General Game Update" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            // Aucun canal ne recoit le message (aucune plateforme detectee = aucun routage)
            (0, vitest_1.expect)(pcChannel.send).not.toHaveBeenCalled();
            (0, vitest_1.expect)(psChannel.send).not.toHaveBeenCalled();
            // Mais on persiste quand meme pour ne pas renotifier
            (0, vitest_1.expect)(mockProcessedPatchNotesCreate).toHaveBeenCalledTimes(1);
        });
    });
    (0, vitest_1.describe)("Salon indisponible", () => {
        (0, vitest_1.it)("ignore un salon qui n'existe pas", async () => {
            const client = makeMockClient({
            // steam-epic-chan n'est PAS dans la map → fetch renvoie null
            });
            const item = makeFeedItem({ title: "[Steam] Patch v1" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(mockLoggerError).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Salon"));
        });
        (0, vitest_1.it)("ignore un salon qui n'est pas textuel", async () => {
            const nonTextChannel = makeMockTextChannel({
                id: "steam-epic-chan",
                isTextBased: (() => false),
            });
            const client = makeMockClient({ "steam-epic-chan": nonTextChannel });
            const item = makeFeedItem({ title: "[Steam] Patch v2" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(nonTextChannel.send).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Persistance apres echec d'envoi", () => {
        (0, vitest_1.it)("persiste meme si le send echoue", async () => {
            const channel = makeMockTextChannel({
                id: "steam-epic-chan",
                send: vitest_1.vi.fn().mockRejectedValue(new Error("Discord rate limit")),
            });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "[Steam] Patch Error" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(mockLoggerError).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Echec envoi"));
            // Persiste quand meme
            (0, vitest_1.expect)(mockProcessedPatchNotesCreate).toHaveBeenCalledWith({
                data: { guid: item.guid, title: item.title.slice(0, 255) },
            });
        });
    });
    (0, vitest_1.describe)("Erreur inattendue (catch global)", () => {
        (0, vitest_1.it)("log l'erreur critique si Prisma lance une exception imprevue", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "[Steam] Patch DB Error" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
            // Prisma throw sur findUnique
            mockProcessedPatchNotesFindUnique.mockRejectedValue(new Error("DB connection lost"));
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(mockLoggerError).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Erreur critique"), vitest_1.expect.objectContaining({ stack: vitest_1.expect.any(String) }));
        });
    });
    (0, vitest_1.describe)("Resilience (plusieurs articles)", () => {
        (0, vitest_1.it)("traite plusieurs articles du flux RSS", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item1 = makeFeedItem({ guid: "guid-1", title: "[Steam] Patch A" });
            const item2 = makeFeedItem({ guid: "guid-2", title: "[Steam] Patch B" });
            const item3 = makeFeedItem({ guid: "guid-3", title: "[Steam] Patch C" });
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item1, item2, item3] }) });
            // item1 connu, item2 et item3 nouveaux
            mockProcessedPatchNotesFindUnique
                .mockResolvedValueOnce({ id: 1 }) // item1 deja traite
                .mockResolvedValueOnce(null) // item2 nouveau
                .mockResolvedValueOnce(null); // item3 nouveau
            mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });
            await (0, steamNewsCron_1.checkTrackedGames)(client);
            (0, vitest_1.expect)(channel.send).toHaveBeenCalledTimes(2);
        });
    });
});
// ─── Tests: startSteamNewsMonitoring / stopSteamNewsMonitoring ─────────────
(0, vitest_1.describe)("startSteamNewsMonitoring / stopSteamNewsMonitoring", () => {
    (0, vitest_1.it)("demarre et arrete la surveillance", () => {
        const client = makeMockClient();
        (0, steamNewsCron_1.startSteamNewsMonitoring)(client);
        (0, vitest_1.expect)(mockLoggerInfo).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Demarrage"));
        (0, steamNewsCron_1.stopSteamNewsMonitoring)();
        (0, vitest_1.expect)(mockLoggerInfo).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Arrete"));
    });
    (0, vitest_1.it)("empeche le double demarrage", () => {
        const client = makeMockClient();
        (0, steamNewsCron_1.startSteamNewsMonitoring)(client);
        (0, steamNewsCron_1.startSteamNewsMonitoring)(client);
        (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Deja actif"));
    });
    (0, vitest_1.it)("execute une premiere verification immediate au demarrage", async () => {
        const channel = makeMockTextChannel({ id: "steam-epic-chan" });
        const client = makeMockClient({ "steam-epic-chan": channel });
        mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });
        (0, steamNewsCron_1.startSteamNewsMonitoring)(client);
        // Attendre le traitement des microtasks (la verification immediate est synchrone)
        await vitest_1.vi.advanceTimersByTimeAsync(0);
        (0, vitest_1.expect)(mockFetch).toHaveBeenCalled();
    });
});
//# sourceMappingURL=steamNewsCron.test.js.map