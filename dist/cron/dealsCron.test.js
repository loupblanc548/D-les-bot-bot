"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ─── vi.hoisted() - s'execute AVANT les imports ───────────────────────────
const { mockProcessedDealFindUnique, mockProcessedDealCreate } = vitest_1.vi.hoisted(() => ({
    mockProcessedDealFindUnique: vitest_1.vi.fn(),
    mockProcessedDealCreate: vitest_1.vi.fn(),
}));
const { mockLoggerInfo, mockLoggerWarn, mockLoggerError, mockLoggerDebug } = vitest_1.vi.hoisted(() => ({
    mockLoggerInfo: vitest_1.vi.fn(),
    mockLoggerWarn: vitest_1.vi.fn(),
    mockLoggerError: vitest_1.vi.fn(),
    mockLoggerDebug: vitest_1.vi.fn(),
}));
const { mockAxiosGet } = vitest_1.vi.hoisted(() => ({
    mockAxiosGet: vitest_1.vi.fn(),
}));
// ─── Mocks ──────────────────────────────────────────────────────────────────
vitest_1.vi.mock("../prisma", () => ({
    default: {
        processedDeal: {
            findUnique: mockProcessedDealFindUnique,
            create: mockProcessedDealCreate,
        },
    },
}));
vitest_1.vi.mock("../utils/logger", () => ({
    default: {
        info: mockLoggerInfo,
        warn: mockLoggerWarn,
        error: mockLoggerError,
        debug: mockLoggerDebug,
    },
}));
vitest_1.vi.mock("axios", () => ({
    default: {
        get: mockAxiosGet,
    },
}));
vitest_1.vi.mock("../utils/retry", () => ({
    retry: vitest_1.vi.fn((fn) => fn()),
    isRetryableError: vitest_1.vi.fn(() => false),
}));
vitest_1.vi.mock("../utils/metrics", () => ({
    metricsCollector: {
        recordProcessing: vitest_1.vi.fn(),
        recordLatency: vitest_1.vi.fn(),
        getMetrics: vitest_1.vi.fn(() => ({})),
    },
}));
vitest_1.vi.mock("node-cron", () => ({
    default: {
        schedule: vitest_1.vi.fn().mockReturnValue({
            stop: vitest_1.vi.fn(),
        }),
    },
}));
vitest_1.vi.mock("discord.js", () => ({
    Client: vitest_1.vi.fn(),
    TextChannel: vitest_1.vi.fn(),
    EmbedBuilder: vitest_1.vi.fn().mockImplementation(function () {
        this.title = "";
        this.url = "";
        this.color = 0;
        this.description = "";
        this.fields = [];
        this.footer = null;
        this.timestamp = null;
        this.setTitle = vitest_1.vi.fn(function (t) { this.title = t; return this; });
        this.setURL = vitest_1.vi.fn(function (u) { this.url = u; return this; });
        this.setColor = vitest_1.vi.fn(function (c) { this.color = c; return this; });
        this.setDescription = vitest_1.vi.fn(function (d) { this.description = d; return this; });
        this.addFields = vitest_1.vi.fn(function (...f) { this.fields.push(...f); return this; });
        this.setFooter = vitest_1.vi.fn(function (f) { this.footer = f; return this; });
        this.setImage = vitest_1.vi.fn(function (img) { this.image = img; return this; });
        this.setTimestamp = vitest_1.vi.fn(function () { this.timestamp = new Date(); return this; });
        return this;
    }),
}));
// ─── Import du module sous test ────────────────────────────────────────────
const dealsCron_1 = require("./dealsCron");
// ─── Helpers ───────────────────────────────────────────────────────────────
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
let _feedItemCounter = 0;
function makeFeedItem(overrides = {}) {
    _feedItemCounter++;
    return {
        title: "[Steam] Game Deal -" + _feedItemCounter + "%",
        link: "https://reddit.com/r/GameDeals/" + _feedItemCounter,
        pubDate: new Date(Date.now() - 3600000).toISOString(),
        content: "Full deal description here",
        contentSnippet: "Deal summary",
        ...overrides,
    };
}
// ─── Setup / Teardown ──────────────────────────────────────────────────────
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    vitest_1.vi.useFakeTimers({ shouldAdvanceTime: true });
    // Tous les channels actifs par defaut
    dealsCron_1.PLATFORM_CONFIGS[0].channelId = "steam-epic-chan";
    dealsCron_1.PLATFORM_CONFIGS[1].channelId = "steam-epic-chan";
    dealsCron_1.PLATFORM_CONFIGS[2].channelId = "playstation-chan";
    dealsCron_1.PLATFORM_CONFIGS[3].channelId = "xbox-chan";
    dealsCron_1.PLATFORM_CONFIGS[4].channelId = "nintendo-chan";
    (0, dealsCron_1.stopDealsMonitoring)();
});
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.useRealTimers();
});
// ─── Tests: detectPlatform ─────────────────────────────────────────────────
(0, vitest_1.describe)("detectPlatforms", () => {
    (0, vitest_1.it)("detecte un deal Steam via [Steam]", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[Steam] Super Game -80%");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Steam");
    });
    (0, vitest_1.it)("detecte Microsoft comme Xbox (word boundary)", () => {
        const result = (0, dealsCron_1.detectPlatforms)("Microsoft Store Deal");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Xbox");
    });
    (0, vitest_1.it)(`ne detecte pas Epic dans "Epidemic" (word boundary)`, () => {
        const result = (0, dealsCron_1.detectPlatforms)("Epidemic Outbreak Sale");
        (0, vitest_1.expect)(result).toEqual([]);
    });
    (0, vitest_1.it)(`ne detecte pas Steam dans "Steaming Hot Deals" (word boundary)`, () => {
        const result = (0, dealsCron_1.detectPlatforms)("Steaming Hot Deals");
        (0, vitest_1.expect)(result).toEqual([]);
    });
    (0, vitest_1.it)("detecte plusieurs plateformes dans un titre multi-plateforme", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[Steam] [PS5] Multi-platform Game");
        const names = result.map(p => p.name);
        (0, vitest_1.expect)(names).toContain("Steam");
        (0, vitest_1.expect)(names).toContain("PlayStation");
        (0, vitest_1.expect)(result.length).toBeGreaterThanOrEqual(2);
    });
    (0, vitest_1.it)("detecte Xbox et Nintendo dans un titre double", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[Xbox Series] [Switch] Crossplay Game");
        const names = result.map(p => p.name);
        (0, vitest_1.expect)(names).toContain("Xbox");
        (0, vitest_1.expect)(names).toContain("Nintendo");
    });
    (0, vitest_1.it)("detecte Steam avec le mot-cle GOG", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[GOG] Classic RPG Free");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Steam");
    });
    (0, vitest_1.it)("detecte un deal Epic Games via [Epic Games]", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[Epic Games] Free Game");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Epic Games");
    });
    (0, vitest_1.it)("detecte un deal PlayStation via [PS5]", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[PS5] Deal AAA -50%");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("PlayStation");
    });
    (0, vitest_1.it)("detecte un deal Xbox via [Xbox Series]", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[Xbox Series] Ultimate Edition");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Xbox");
    });
    (0, vitest_1.it)("detecte un deal Nintendo via [Switch]", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[Switch] Soldes eShop");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Nintendo");
    });
    (0, vitest_1.it)("retourne un tableau vide si aucune plateforme detectee", () => {
        const result = (0, dealsCron_1.detectPlatforms)("Generic Game Update");
        (0, vitest_1.expect)(result).toEqual([]);
    });
    (0, vitest_1.it)("est insensible a la casse", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[steam] lowercase deal");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Steam");
    });
    (0, vitest_1.it)("detecte Microsoft comme Xbox (word boundary)", () => {
        const result = (0, dealsCron_1.detectPlatforms)("Microsoft Store Deal");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Xbox");
    });
    (0, vitest_1.it)(`ne detecte pas Epic dans "Epidemic" (word boundary)`, () => {
        const result = (0, dealsCron_1.detectPlatforms)("Epidemic Outbreak Sale");
        (0, vitest_1.expect)(result).toEqual([]);
    });
    (0, vitest_1.it)(`ne detecte pas Steam dans "Steaming Hot Deals" (word boundary)`, () => {
        const result = (0, dealsCron_1.detectPlatforms)("Steaming Hot Deals");
        (0, vitest_1.expect)(result).toEqual([]);
    });
    (0, vitest_1.it)("detecte plusieurs plateformes dans un titre multi-plateforme", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[Steam] [PS5] Multi-platform Game");
        const names = result.map(p => p.name);
        (0, vitest_1.expect)(names).toContain("Steam");
        (0, vitest_1.expect)(names).toContain("PlayStation");
        (0, vitest_1.expect)(result.length).toBeGreaterThanOrEqual(2);
    });
    (0, vitest_1.it)("detecte Xbox et Nintendo dans un titre double", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[Xbox Series] [Switch] Crossplay Game");
        const names = result.map(p => p.name);
        (0, vitest_1.expect)(names).toContain("Xbox");
        (0, vitest_1.expect)(names).toContain("Nintendo");
    });
    (0, vitest_1.it)("detecte Steam avec le mot-cle GOG", () => {
        const result = (0, dealsCron_1.detectPlatforms)("[GOG] Classic RPG Free");
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].name).toBe("Steam");
    });
});
// ─── Tests: checkDeals ─────────────────────────────────────────────────────
(0, vitest_1.describe)("checkDeals", () => {
    (0, vitest_1.describe)("Gardes anti-crash", () => {
        (0, vitest_1.it)("retourne immediatement si aucun CHANNEL_ID n'est configure", async () => {
            dealsCron_1.PLATFORM_CONFIGS[0].channelId = undefined;
            dealsCron_1.PLATFORM_CONFIGS[2].channelId = undefined;
            dealsCron_1.PLATFORM_CONFIGS[3].channelId = undefined;
            dealsCron_1.PLATFORM_CONFIGS[1].channelId = undefined;
            dealsCron_1.PLATFORM_CONFIGS[2].channelId = undefined;
            dealsCron_1.PLATFORM_CONFIGS[3].channelId = undefined;
            dealsCron_1.PLATFORM_CONFIGS[4].channelId = undefined;
            const client = makeMockClient();
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Aucun CHANNEL_ID configure"));
            (0, vitest_1.expect)(mockAxiosGet).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("continue si au moins un channel est configure", async () => {
            dealsCron_1.PLATFORM_CONFIGS[2].channelId = undefined;
            dealsCron_1.PLATFORM_CONFIGS[3].channelId = undefined;
            dealsCron_1.PLATFORM_CONFIGS[4].channelId = undefined;
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            mockAxiosGet.mockResolvedValue({ data: { items: [] } });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(mockAxiosGet).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Echec fetch RSS", () => {
        (0, vitest_1.it)("garde l'erreur d'un flux et continue avec les autres", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            // Premier flux echoue, deuxieme reussit
            mockAxiosGet
                .mockRejectedValueOnce(new Error("Network error"))
                .mockResolvedValueOnce({ data: { items: [] } });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(mockLoggerError).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Erreur analyse du flux"), vitest_1.expect.any(Object));
        });
    });
    (0, vitest_1.describe)("Flux RSS vide", () => {
        (0, vitest_1.it)("ne fait rien si aucun item", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(channel.send).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Deduplication via ProcessedDeal", () => {
        (0, vitest_1.it)("ignore un deal deja traite", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "[Steam] Already Seen Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue({ id: 1 }); // deja traite
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(channel.send).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("route un nouveau deal", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "[Steam] New Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(channel.send).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)("gere une erreur Prisma dans isDealProcessed", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "[Steam] DB Error Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockRejectedValue(new Error("DB error"));
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            // Prisma error in findUnique -> should log warning and continue as if not processed
            (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Erreur verification ProcessedDeal"));
            (0, vitest_1.expect)(channel.send).toHaveBeenCalledTimes(1);
        });
    });
    (0, vitest_1.describe)("Routage par plateforme", () => {
        (0, vitest_1.it)("route un deal PC vers STEAM_EPIC_CHANNEL_ID", async () => {
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const psChannel = makeMockTextChannel({ id: "playstation-chan" });
            const client = makeMockClient({
                "steam-epic-chan": pcChannel,
                "playstation-chan": psChannel,
            });
            const item = makeFeedItem({ title: "[Steam] PC Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(pcChannel.send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(psChannel.send).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("route un deal PlayStation vers PLAYSTATION_CHANNEL_ID", async () => {
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const psChannel = makeMockTextChannel({ id: "playstation-chan" });
            const client = makeMockClient({
                "steam-epic-chan": pcChannel,
                "playstation-chan": psChannel,
            });
            const item = makeFeedItem({ title: "[PS5] PS Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(psChannel.send).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(pcChannel.send).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Fallback plateforme inconnue", () => {
        (0, vitest_1.it)("envoie vers le salon PC par defaut si plateforme non detectee", async () => {
            const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": pcChannel });
            const item = makeFeedItem({ title: "Generic Gaming Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Plateforme non detectee"));
            (0, vitest_1.expect)(pcChannel.send).toHaveBeenCalledTimes(1);
        });
    });
    (0, vitest_1.describe)("Salon indisponible", () => {
        (0, vitest_1.it)("ignore un deal si le salon platf. n'existe pas", async () => {
            const client = makeMockClient({}); // Aucun channel dans la map
            const item = makeFeedItem({ title: "[Xbox] Xbox Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Channel"));
        });
        (0, vitest_1.it)("ignore un deal si le salon n'est pas textuel", async () => {
            const nonTextChannel = makeMockTextChannel({
                id: "steam-epic-chan",
                isTextBased: (() => false),
            });
            const client = makeMockClient({ "steam-epic-chan": nonTextChannel });
            const item = makeFeedItem({ title: "[Steam] Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(nonTextChannel.send).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("Echec d'envoi", () => {
        (0, vitest_1.it)("log l'erreur si channel.send echoue mais continue", async () => {
            const channel = makeMockTextChannel({
                id: "steam-epic-chan",
                send: vitest_1.vi.fn().mockRejectedValue(new Error("Rate limit")),
            });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "[Steam] Error Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            (0, vitest_1.expect)(mockLoggerError).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Erreur envoi deal"), vitest_1.expect.any(Object));
        });
    });
    (0, vitest_1.describe)("Erreur Prisma dans markDealProcessed", () => {
        (0, vitest_1.it)("log debug si ProcessedDeal.create echoue (doublon ou autre)", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const item = makeFeedItem({ title: "[Steam] Duplicate DB Deal" });
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items: [item] } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            // create echoue (doublon)
            mockProcessedDealCreate.mockRejectedValue(new Error("Unique constraint"));
            await (0, dealsCron_1.checkDeals)(client);
            // Le send reussit quand meme
            (0, vitest_1.expect)(channel.send).toHaveBeenCalledTimes(1);
            // Le catch de markDealProcessed log en debug
            (0, vitest_1.expect)(mockLoggerDebug).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Deal deja persiste"));
        });
    });
    (0, vitest_1.describe)("Plusieurs items dans le flux", () => {
        (0, vitest_1.it)("traite les 10 derniers items au maximum", async () => {
            const channel = makeMockTextChannel({ id: "steam-epic-chan" });
            const client = makeMockClient({ "steam-epic-chan": channel });
            const items = Array.from({ length: 15 }, (_, i) => makeFeedItem({ title: "[Steam] Deal #" + i, link: "https://reddit.com/" + i }));
            mockAxiosGet
                .mockResolvedValueOnce({ data: { items } })
                .mockResolvedValueOnce({ data: { items: [] } });
            mockProcessedDealFindUnique.mockResolvedValue(null);
            mockProcessedDealCreate.mockResolvedValue({ id: 1 });
            await (0, dealsCron_1.checkDeals)(client);
            // 10 items sur 15 (slice(0,10))
            (0, vitest_1.expect)(channel.send).toHaveBeenCalledTimes(10);
        });
    });
});
// ─── Tests: startDealsMonitoring / stopDealsMonitoring ─────────────────────
(0, vitest_1.describe)("startDealsMonitoring / stopDealsMonitoring", () => {
    (0, vitest_1.it)("demarre et arrete la surveillance", () => {
        const client = makeMockClient();
        (0, dealsCron_1.startDealsMonitoring)(client);
        (0, vitest_1.expect)(mockLoggerInfo).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Demarrage de la surveillance"));
        (0, dealsCron_1.stopDealsMonitoring)();
        (0, vitest_1.expect)(mockLoggerInfo).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Surveillance arretee"));
    });
    (0, vitest_1.it)("empeche le double demarrage", () => {
        const client = makeMockClient();
        (0, dealsCron_1.startDealsMonitoring)(client);
        (0, dealsCron_1.startDealsMonitoring)(client);
        (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Surveillance deja active"));
    });
    (0, vitest_1.it)("retourne immediatement si aucun channel configure", () => {
        dealsCron_1.PLATFORM_CONFIGS[0].channelId = undefined;
        dealsCron_1.PLATFORM_CONFIGS[1].channelId = undefined;
        dealsCron_1.PLATFORM_CONFIGS[2].channelId = undefined;
        dealsCron_1.PLATFORM_CONFIGS[3].channelId = undefined;
        dealsCron_1.PLATFORM_CONFIGS[4].channelId = undefined;
        const client = makeMockClient();
        (0, dealsCron_1.startDealsMonitoring)(client);
        (0, vitest_1.expect)(mockLoggerWarn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Aucun CHANNEL_ID configure"));
    });
    (0, vitest_1.it)("execute un check immediat au demarrage", async () => {
        const channel = makeMockTextChannel({ id: "steam-epic-chan" });
        const client = makeMockClient({ "steam-epic-chan": channel });
        mockAxiosGet
            .mockResolvedValueOnce({ data: { items: [] } })
            .mockResolvedValueOnce({ data: { items: [] } });
        (0, dealsCron_1.startDealsMonitoring)(client);
        await vitest_1.vi.advanceTimersByTimeAsync(0);
        (0, vitest_1.expect)(mockAxiosGet).toHaveBeenCalled();
    });
});
//# sourceMappingURL=dealsCron.test.js.map