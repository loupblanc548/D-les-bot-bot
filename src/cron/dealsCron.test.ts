import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client, TextChannel } from "discord.js";

// ─── vi.hoisted() - s'execute AVANT les imports ───────────────────────────

const { mockProcessedDealFindUnique, mockProcessedDealCreate } = vi.hoisted(() => ({
  mockProcessedDealFindUnique: vi.fn(),
  mockProcessedDealCreate: vi.fn(),
}));

const { mockLoggerInfo, mockLoggerWarn, mockLoggerError, mockLoggerDebug } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
}));

const { mockAxiosGet } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
}));

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../prisma", () => ({
  default: {
    processedDeal: {
      findUnique: mockProcessedDealFindUnique,
      create: mockProcessedDealCreate,
    },
  },
}));

vi.mock("../utils/logger", () => ({
  default: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

vi.mock("axios", () => ({
  default: {
    get: mockAxiosGet,
  },
}));

vi.mock("../utils/retry", () => ({
  retry: vi.fn((fn: () => Promise<unknown>) => fn()),
  isRetryableError: vi.fn(() => false),
}));

vi.mock("../utils/metrics", () => ({
  metricsCollector: {
    recordProcessing: vi.fn(),
    recordLatency: vi.fn(),
    getMetrics: vi.fn(() => ({})),
  },
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn().mockReturnValue({
      stop: vi.fn(),
    }),
  },
}));

vi.mock("discord.js", () => ({
  Client: vi.fn(),
  TextChannel: vi.fn(),
  EmbedBuilder: vi.fn().mockImplementation(function (this: any) {
    this.title = "";
    this.url = "";
    this.color = 0;
    this.description = "";
    this.fields = [];
    this.footer = null;
    this.timestamp = null;
    this.setTitle = vi.fn(function (this: any, t: string) {
      this.title = t;
      return this;
    });
    this.setURL = vi.fn(function (this: any, u: string) {
      this.url = u;
      return this;
    });
    this.setColor = vi.fn(function (this: any, c: number) {
      this.color = c;
      return this;
    });
    this.setDescription = vi.fn(function (this: any, d: string) {
      this.description = d;
      return this;
    });
    this.addFields = vi.fn(function (this: any, ...f: any[]) {
      this.fields.push(...f);
      return this;
    });
    this.setFooter = vi.fn(function (this: any, f: any) {
      this.footer = f;
      return this;
    });
    this.setImage = vi.fn(function (this: any, img: string) {
      this.image = img;
      return this;
    });
    this.setTimestamp = vi.fn(function (this: any) {
      this.timestamp = new Date();
      return this;
    });
    return this;
  }),
}));

// ─── Import du module sous test ────────────────────────────────────────────
import {
  checkDeals,
  startDealsMonitoring,
  stopDealsMonitoring,
  detectPlatforms,
  PLATFORM_CONFIGS,
} from "./dealsCron.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeMockTextChannel(overrides: Record<string, unknown> = {}): TextChannel {
  return {
    id: "channel-123",
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as TextChannel;
}

function makeMockClient(channelsMap: Record<string, TextChannel | null> = {}): Client {
  return {
    channels: {
      fetch: vi.fn().mockImplementation(async (id: string) => channelsMap[id] ?? null),
      cache: { get: vi.fn() },
    },
  } as unknown as Client;
}

let _feedItemCounter = 0;
function makeFeedItem(overrides: Record<string, string> = {}) {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Tous les channels actifs par defaut
  PLATFORM_CONFIGS[0].channelId = "steam-epic-chan";
  PLATFORM_CONFIGS[1].channelId = "steam-epic-chan";
  PLATFORM_CONFIGS[2].channelId = "playstation-chan";
  PLATFORM_CONFIGS[3].channelId = "xbox-chan";
  PLATFORM_CONFIGS[4].channelId = "nintendo-chan";
  PLATFORM_CONFIGS[5].channelId = "fortnite-chan";
  PLATFORM_CONFIGS[6].channelId = "ig-chan";
  stopDealsMonitoring();
});

vi.mock("../utils/deduplicationCache", () => ({
  dedupCache: {
    reloadFromDisk: vi.fn(),
    isAlreadyProcessed: vi.fn().mockReturnValue(false),
    markAsProcessed: vi.fn().mockResolvedValue(undefined),
  },
}));

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests: detectPlatform ─────────────────────────────────────────────────

describe("detectPlatforms", () => {
  it("detecte un deal Steam via [Steam]", () => {
    const result = detectPlatforms("[Steam] Super Game -80%");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Steam");
  });
  it("detecte Microsoft comme Xbox (word boundary)", () => {
    const result = detectPlatforms("Microsoft Store Deal");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Xbox");
  });

  it(`ne detecte pas Epic dans "Epidemic" (word boundary)`, () => {
    const result = detectPlatforms("Epidemic Outbreak Sale");
    expect(result).toEqual([]);
  });

  it(`ne detecte pas Steam dans "Steaming Hot Deals" (word boundary)`, () => {
    const result = detectPlatforms("Steaming Hot Deals");
    expect(result).toEqual([]);
  });

  it("detecte plusieurs plateformes dans un titre multi-plateforme", () => {
    const result = detectPlatforms("[Steam] [PS5] Multi-platform Game");
    const names = result.map((p) => p.name);
    expect(names).toContain("Steam");
    expect(names).toContain("PlayStation");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("detecte Xbox et Nintendo dans un titre double", () => {
    const result = detectPlatforms("[Xbox Series] [Switch] Crossplay Game");
    const names = result.map((p) => p.name);
    expect(names).toContain("Xbox");
    expect(names).toContain("Nintendo");
  });

  it("detecte Steam avec le mot-cle GOG", () => {
    const result = detectPlatforms("[GOG] Classic RPG Free");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Steam");
  });

  it("detecte un deal Epic Games via [Epic Games]", () => {
    const result = detectPlatforms("[Epic Games] Free Game");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Epic Games");
  });

  it("detecte un deal PlayStation via [PS5]", () => {
    const result = detectPlatforms("[PS5] Deal AAA -50%");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("PlayStation");
  });

  it("detecte un deal Xbox via [Xbox Series]", () => {
    const result = detectPlatforms("[Xbox Series] Ultimate Edition");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Xbox");
  });

  it("detecte un deal Nintendo via [Switch]", () => {
    const result = detectPlatforms("[Switch] Soldes eShop");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Nintendo");
  });

  it("retourne un tableau vide si aucune plateforme detectee", () => {
    const result = detectPlatforms("Generic Game Update");
    expect(result).toEqual([]);
  });

  it("est insensible a la casse", () => {
    const result = detectPlatforms("[steam] lowercase deal");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Steam");
  });
  it("detecte Microsoft comme Xbox (word boundary)", () => {
    const result = detectPlatforms("Microsoft Store Deal");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Xbox");
  });

  it(`ne detecte pas Epic dans "Epidemic" (word boundary)`, () => {
    const result = detectPlatforms("Epidemic Outbreak Sale");
    expect(result).toEqual([]);
  });

  it(`ne detecte pas Steam dans "Steaming Hot Deals" (word boundary)`, () => {
    const result = detectPlatforms("Steaming Hot Deals");
    expect(result).toEqual([]);
  });

  it("detecte plusieurs plateformes dans un titre multi-plateforme", () => {
    const result = detectPlatforms("[Steam] [PS5] Multi-platform Game");
    const names = result.map((p) => p.name);
    expect(names).toContain("Steam");
    expect(names).toContain("PlayStation");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("detecte Xbox et Nintendo dans un titre double", () => {
    const result = detectPlatforms("[Xbox Series] [Switch] Crossplay Game");
    const names = result.map((p) => p.name);
    expect(names).toContain("Xbox");
    expect(names).toContain("Nintendo");
  });

  it("detecte Steam avec le mot-cle GOG", () => {
    const result = detectPlatforms("[GOG] Classic RPG Free");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Steam");
  });
});

// ─── Tests: checkDeals ─────────────────────────────────────────────────────

describe("checkDeals", () => {
  describe("Gardes anti-crash", () => {
    it("retourne immediatement si aucun CHANNEL_ID n'est configure", async () => {
      PLATFORM_CONFIGS[0].channelId = undefined;
      PLATFORM_CONFIGS[2].channelId = undefined;
      PLATFORM_CONFIGS[3].channelId = undefined;
      PLATFORM_CONFIGS[1].channelId = undefined;
      PLATFORM_CONFIGS[2].channelId = undefined;
      PLATFORM_CONFIGS[3].channelId = undefined;
      PLATFORM_CONFIGS[4].channelId = undefined;
      PLATFORM_CONFIGS[5].channelId = undefined;
      PLATFORM_CONFIGS[6].channelId = undefined;

      const client = makeMockClient();
      await checkDeals(client);

      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining("CHANNEL_ID"));
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it("continue si au moins un channel est configure", async () => {
      PLATFORM_CONFIGS[2].channelId = undefined;
      PLATFORM_CONFIGS[3].channelId = undefined;
      PLATFORM_CONFIGS[4].channelId = undefined;

      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      mockAxiosGet.mockResolvedValue({ data: { items: [] } });

      await checkDeals(client);

      expect(mockAxiosGet).toHaveBeenCalled();
    });
  });

  describe("Echec fetch RSS", () => {
    it("garde l'erreur d'un flux et continue avec les autres", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      // Premier flux echoue, deuxieme reussit
      mockAxiosGet
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ data: { items: [] } });

      await checkDeals(client);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining("Erreur analyse du flux"),
        expect.any(Object),
      );
    });
  });

  describe("Flux RSS vide", () => {
    it("ne fait rien si aucun item", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [] } })
        .mockResolvedValueOnce({ data: { items: [] } });

      await checkDeals(client);

      expect(channel.send).not.toHaveBeenCalled();
    });
  });

  describe("Deduplication via ProcessedDeal", () => {
    it("ignore un deal deja traite", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "[Steam] Already Seen Deal" });
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [item] } })
        .mockResolvedValueOnce({ data: { items: [] } });

      mockProcessedDealFindUnique.mockResolvedValue({ id: 1 }); // deja traite

      await checkDeals(client);

      expect(channel.send).not.toHaveBeenCalled();
    });

    it("route un nouveau deal", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "[Steam] New Deal" });
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [item] } })
        .mockResolvedValueOnce({ data: { items: [] } });

      mockProcessedDealFindUnique.mockResolvedValue(null);
      mockProcessedDealCreate.mockResolvedValue({ id: 1 });

      await checkDeals(client);

      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it("gere une erreur Prisma dans isDealProcessed", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "[Steam] DB Error Deal" });
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [item] } })
        .mockResolvedValueOnce({ data: { items: [] } });

      mockProcessedDealFindUnique.mockRejectedValue(new Error("DB error"));
      mockProcessedDealCreate.mockResolvedValue({ id: 1 });

      await checkDeals(client);

      // Prisma error in findUnique -> should log warning and continue as if not processed
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Erreur verification ProcessedDeal"),
      );
      expect(channel.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("Routage par plateforme", () => {
    it("route un deal PC vers STEAM_EPIC_CHANNEL_ID", async () => {
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

      await checkDeals(client);

      expect(pcChannel.send).toHaveBeenCalledTimes(1);
      expect(psChannel.send).not.toHaveBeenCalled();
    });

    it("route un deal PlayStation vers PLAYSTATION_CHANNEL_ID", async () => {
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

      await checkDeals(client);

      expect(psChannel.send).toHaveBeenCalledTimes(1);
      expect(pcChannel.send).not.toHaveBeenCalled();
    });
  });

  describe("Fallback plateforme inconnue", () => {
    it("envoie vers le salon PC par defaut si plateforme non detectee", async () => {
      const pcChannel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": pcChannel });

      const item = makeFeedItem({ title: "Generic Gaming Deal" });
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [item] } })
        .mockResolvedValueOnce({ data: { items: [] } });
      mockProcessedDealFindUnique.mockResolvedValue(null);
      mockProcessedDealCreate.mockResolvedValue({ id: 1 });

      await checkDeals(client);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Plateforme non detectee"),
      );
      expect(pcChannel.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("Salon indisponible", () => {
    it("ignore un deal si le salon platf. n'existe pas", async () => {
      const client = makeMockClient({}); // Aucun channel dans la map

      const item = makeFeedItem({ title: "[Xbox] Xbox Deal" });
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [item] } })
        .mockResolvedValueOnce({ data: { items: [] } });
      mockProcessedDealFindUnique.mockResolvedValue(null);
      mockProcessedDealCreate.mockResolvedValue({ id: 1 });

      await checkDeals(client);

      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining("Channel"));
    });

    it("ignore un deal si le salon n'est pas textuel", async () => {
      const nonTextChannel = makeMockTextChannel({
        id: "steam-epic-chan",
        isTextBased: (() => false) as unknown as TextChannel["isTextBased"],
      });
      const client = makeMockClient({ "steam-epic-chan": nonTextChannel });

      const item = makeFeedItem({ title: "[Steam] Deal" });
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [item] } })
        .mockResolvedValueOnce({ data: { items: [] } });
      mockProcessedDealFindUnique.mockResolvedValue(null);
      mockProcessedDealCreate.mockResolvedValue({ id: 1 });

      await checkDeals(client);

      expect(nonTextChannel.send).not.toHaveBeenCalled();
    });
  });

  describe("Echec d'envoi", () => {
    it("log l'erreur si channel.send echoue mais continue", async () => {
      const channel = makeMockTextChannel({
        id: "steam-epic-chan",
        send: vi.fn().mockRejectedValue(new Error("Rate limit")),
      });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "[Steam] Error Deal" });
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [item] } })
        .mockResolvedValueOnce({ data: { items: [] } });
      mockProcessedDealFindUnique.mockResolvedValue(null);
      mockProcessedDealCreate.mockResolvedValue({ id: 1 });

      await checkDeals(client);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining("Erreur envoi deal"),
        expect.any(Object),
      );
    });
  });

  describe("Erreur Prisma dans markDealProcessed", () => {
    it("log debug si ProcessedDeal.create echoue (doublon ou autre)", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "[Steam] Duplicate DB Deal" });
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items: [item] } })
        .mockResolvedValueOnce({ data: { items: [] } });
      mockProcessedDealFindUnique.mockResolvedValue(null);
      // create echoue (doublon)
      mockProcessedDealCreate.mockRejectedValue(new Error("Unique constraint"));

      await checkDeals(client);

      // Le send reussit quand meme
      expect(channel.send).toHaveBeenCalledTimes(1);
      // Le catch de markDealProcessed log en debug
      expect(mockLoggerDebug).toHaveBeenCalledWith(expect.stringContaining("Deal deja persiste"));
    });
  });

  describe("Plusieurs items dans le flux", () => {
    it("traite les 10 derniers items au maximum", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const items = Array.from({ length: 15 }, (_, i) =>
        makeFeedItem({ title: "[Steam] Deal #" + i, link: "https://reddit.com/" + i }),
      );
      mockAxiosGet
        .mockResolvedValueOnce({ data: { items } })
        .mockResolvedValueOnce({ data: { items: [] } });

      mockProcessedDealFindUnique.mockResolvedValue(null);
      mockProcessedDealCreate.mockResolvedValue({ id: 1 });

      await checkDeals(client);

      // 10 items sur 15 (slice(0,10))
      expect(channel.send).toHaveBeenCalledTimes(10);
    });
  });
});

// ─── Tests: startDealsMonitoring / stopDealsMonitoring ─────────────────────

describe("startDealsMonitoring / stopDealsMonitoring", () => {
  it("demarre et arrete la surveillance", () => {
    const client = makeMockClient();

    startDealsMonitoring(client);

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining("Demarrage de la surveillance"),
    );

    stopDealsMonitoring();

    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining("Surveillance arretee"));
  });

  it("empeche le double demarrage", () => {
    const client = makeMockClient();

    startDealsMonitoring(client);
    startDealsMonitoring(client);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("Surveillance deja active"),
    );
  });

  it("retourne immediatement si aucun channel configure", () => {
    PLATFORM_CONFIGS[0].channelId = undefined;
    PLATFORM_CONFIGS[1].channelId = undefined;
    PLATFORM_CONFIGS[2].channelId = undefined;
    PLATFORM_CONFIGS[3].channelId = undefined;
    PLATFORM_CONFIGS[4].channelId = undefined;
    PLATFORM_CONFIGS[5].channelId = undefined;
    PLATFORM_CONFIGS[6].channelId = undefined;

    const client = makeMockClient();
    startDealsMonitoring(client);

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining("CHANNEL_ID"));
  });

  it("execute un check immediat au demarrage", async () => {
    const channel = makeMockTextChannel({ id: "steam-epic-chan" });
    const client = makeMockClient({ "steam-epic-chan": channel });

    mockAxiosGet
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({ data: { items: [] } });

    startDealsMonitoring(client);

    await vi.advanceTimersByTimeAsync(0);

    expect(mockAxiosGet).toHaveBeenCalled();
  });
});
