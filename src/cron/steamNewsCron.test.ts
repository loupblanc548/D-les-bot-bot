import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client, EmbedBuilder, TextChannel } from "discord.js";

// ─── vi.hoisted() - s'execute AVANT les imports, evite le hoisting classique ─

const {
  mockProcessedPatchNotesFindUnique,
  mockProcessedPatchNotesCreate,
} = vi.hoisted(() => ({
  mockProcessedPatchNotesFindUnique: vi.fn(),
  mockProcessedPatchNotesCreate: vi.fn(),
}));

const { mockLoggerInfo, mockLoggerWarn, mockLoggerError } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    steamEpicChannel: "steam-epic-chan",
    playstationChannel: "playstation-chan",
    xboxChannel: "xbox-chan",
    nintendoChannel: "nintendo-chan",
  },
}));

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../prisma", () => ({
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

// Mock minimal de config.ts (seules les proprietes utilisees par steamNewsCron sont fournies)
vi.mock("../config", () => ({
  config: mockConfig,
}));

vi.mock("../utils/logger", () => ({
  default: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

vi.mock("discord.js", () => ({
  Client: vi.fn(),
  TextChannel: vi.fn(),
  EmbedBuilder: vi.fn().mockImplementation(function (this: any) {
    this.title = "";
    this.url = "";
    this.color = 0;
    this.author = null;
    this.description = "";
    this.fields = [];
    this.footer = null;
    this.timestamp = null;
    this.image = null;
    this.setTitle = vi.fn(function (this: any, t: string) { this.title = t; return this; });
    this.setURL = vi.fn(function (this: any, u: string) { this.url = u; return this; });
    this.setColor = vi.fn(function (this: any, c: number) { this.color = c; return this; });
    this.setAuthor = vi.fn(function (this: any, a: any) { this.author = a; return this; });
    this.setDescription = vi.fn(function (this: any, d: string) { this.description = d; return this; });
    this.addFields = vi.fn(function (this: any, ...f: any[]) { this.fields.push(...f); return this; });
    this.setFooter = vi.fn(function (this: any, f: any) { this.footer = f; return this; });
    this.setTimestamp = vi.fn(function (this: any) { this.timestamp = new Date(); return this; });
    this.setImage = vi.fn(function (this: any, img: string) { this.image = img; return this; });
    return this;
  }),
}));

// ─── Import du module sous test (APRES les mocks) ──────────────────────────
vi.mock("../utils/deduplicationCache", () => ({
  dedupCache: {
    reloadFromDisk: vi.fn(),
    isAlreadyProcessed: vi.fn().mockReturnValue(false),
    markAsProcessed: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../utils/retry", () => ({
  retry: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

vi.mock("../utils/cache", () => ({
  dbCache: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("../utils/metrics", () => ({
  metricsCollector: {
    recordProcessing: vi.fn(),
  },
}));


import {
  checkTrackedGames,
  startSteamNewsMonitoring,
  stopSteamNewsMonitoring,
  PLATFORM_CONFIGS,
} from "./steamNewsCron.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function makeFeedItem(overrides: Record<string, string> = {}) {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Configurer PLATFORM_CONFIGS pour que tous les channels soient actifs
  PLATFORM_CONFIGS.epic.channelId = "steam-epic-chan";
  PLATFORM_CONFIGS.steam.channelId = "steam-epic-chan";
  PLATFORM_CONFIGS.playstation.channelId = "playstation-chan";
  PLATFORM_CONFIGS.xbox.channelId = "xbox-chan";
  PLATFORM_CONFIGS.nintendo.channelId = "nintendo-chan";
  // Arreter toute surveillance active
  stopSteamNewsMonitoring();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests: checkTrackedGames ───────────────────────────────────────────────

describe("checkTrackedGames", () => {
  describe("Gardes anti-crash", () => {
    it("retourne immediatement si aucun CHANNEL_ID n'est configure", async () => {
      // Desactiver tous les channels via PLATFORM_CONFIGS
      PLATFORM_CONFIGS.epic.channelId = undefined;
      PLATFORM_CONFIGS.steam.channelId = undefined;
      PLATFORM_CONFIGS.playstation.channelId = undefined;
      PLATFORM_CONFIGS.xbox.channelId = undefined;
      PLATFORM_CONFIGS.nintendo.channelId = undefined;

      const client = makeMockClient();
      await checkTrackedGames(client);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Aucun CHANNEL_ID")
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("continue si au moins un CHANNEL_ID est configure", async () => {
      // Un seul channel actif
      PLATFORM_CONFIGS.epic.channelId = undefined;
      PLATFORM_CONFIGS.playstation.channelId = undefined;
      PLATFORM_CONFIGS.xbox.channelId = undefined;
      PLATFORM_CONFIGS.nintendo.channelId = undefined;

      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });

      await checkTrackedGames(client);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("Verrouillage (isChecking)", () => {
    it("ignore les appels concurrents", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      // Premier appel : le RSS met du temps
      let resolveRss: (value: any) => void;
      const rssPromise = new Promise<any>((resolve) => { resolveRss = resolve; });
      mockFetch.mockReturnValue(Promise.resolve({ ok: true, json: () => rssPromise }));

      const firstCall = checkTrackedGames(client);
      const secondCall = checkTrackedGames(client);

      // Resoudre le RSS
      resolveRss!({ items: [] });
      await Promise.all([firstCall, secondCall]);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining("Verification deja en cours")
      );
    });
  });

  describe("Echec du fetch RSS", () => {
    it("gere l'erreur RSS sans crasher", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await checkTrackedGames(client);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Flux Reddit inaccessible")
      );
      expect(channel.send).not.toHaveBeenCalled();
    });
  });

  describe("Flux vide", () => {
    it("ne fait rien si le flux est vide", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });

      await checkTrackedGames(client);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining("Aucun article trouve")
      );
      expect(channel.send).not.toHaveBeenCalled();
    });
  });

  describe("Deduplication via ProcessedPatchNotes", () => {
    it("ignore les articles deja traites", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "PC patch v2" });
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
      mockProcessedPatchNotesFindUnique.mockResolvedValue({ id: 1 }); // deja traite

      await checkTrackedGames(client);

      expect(channel.send).not.toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining("Tous les articles sont deja connus")
      );
    });

    it("route les nouveaux articles", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "PC patch v3" });
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
      mockProcessedPatchNotesFindUnique.mockResolvedValue(null); // nouveau
      mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });

      await checkTrackedGames(client);

      expect(channel.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("Routage plateforme unique", () => {
    it("route un patch note PC vers STEAM_EPIC_CHANNEL_ID", async () => {
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

      await checkTrackedGames(client);

      expect(pcChannel.send).toHaveBeenCalledTimes(1);
      expect(psChannel.send).not.toHaveBeenCalled();
      expect(pcChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Steam"),
        })
      );
    });

    it("route un patch note PlayStation vers PLAYSTATION_CHANNEL_ID", async () => {
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

      await checkTrackedGames(client);

      expect(psChannel.send).toHaveBeenCalledTimes(1);
      expect(pcChannel.send).not.toHaveBeenCalled();
    });

    it("route un patch note Xbox vers XBOX_CHANNEL_ID", async () => {
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

      await checkTrackedGames(client);

      expect(xboxChannel.send).toHaveBeenCalledTimes(1);
      expect(pcChannel.send).not.toHaveBeenCalled();
    });

    it("route un patch note Nintendo vers NINTENDO_CHANNEL_ID", async () => {
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

      await checkTrackedGames(client);

      expect(ninChannel.send).toHaveBeenCalledTimes(1);
      expect(pcChannel.send).not.toHaveBeenCalled();
    });
  });

  describe("Routage multi-plateforme", () => {
    it("envoie un patch note PC+PS5 dans les DEUX salons", async () => {
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

      await checkTrackedGames(client);

      expect(pcChannel.send).toHaveBeenCalledTimes(1);
      expect(psChannel.send).toHaveBeenCalledTimes(1);
    });

    it("envoie un patch note toutes plateformes dans les 4 salons", async () => {
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

      await checkTrackedGames(client);

      expect(channels["steam-epic-chan"].send).toHaveBeenCalledTimes(2);
      expect(channels["playstation-chan"].send).toHaveBeenCalledTimes(1);
      expect(channels["xbox-chan"].send).toHaveBeenCalledTimes(1);
      expect(channels["nintendo-chan"].send).toHaveBeenCalledTimes(1);
    });

    it("persiste UNE SEULE fois meme en multi-plateforme", async () => {
      const channels = {
        "steam-epic-chan": makeMockTextChannel({ id: "steam-epic-chan" }),
        "playstation-chan": makeMockTextChannel({ id: "playstation-chan" }),
      };
      const client = makeMockClient(channels);

      const item = makeFeedItem({ title: "PC and PS5 Patch" });
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
      mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
      mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });

      await checkTrackedGames(client);

      expect(mockProcessedPatchNotesCreate).toHaveBeenCalledTimes(1);
      expect(mockProcessedPatchNotesCreate).toHaveBeenCalledWith({
        data: { guid: item.guid, title: item.title.slice(0, 255) },
      });
    });
  });

  describe("Plateforme non detectee", () => {
    it("ne route pas un article sans mot-cle de plateforme", async () => {
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

      await checkTrackedGames(client);

      // Aucun canal ne recoit le message (aucune plateforme detectee = aucun routage)
      // Le code fait un continue sans persister quand aucune plateforme nest detectee
      expect(pcChannel.send).not.toHaveBeenCalled();
      expect(psChannel.send).not.toHaveBeenCalled();
      expect(mockProcessedPatchNotesCreate).not.toHaveBeenCalled();
    });
  });

  describe("Salon indisponible", () => {
    it("ignore un salon qui n'existe pas", async () => {
      const client = makeMockClient({
        // steam-epic-chan n'est PAS dans la map → fetch renvoie null
      });

      const item = makeFeedItem({ title: "[Steam] Patch v1" });
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
      mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
      mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });

      await checkTrackedGames(client);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining("Salon")
      );
    });

    it("ignore un salon qui n'est pas textuel", async () => {
      const nonTextChannel = makeMockTextChannel({
        id: "steam-epic-chan",
        isTextBased: (() => false) as unknown as TextChannel["isTextBased"],
      });
      const client = makeMockClient({ "steam-epic-chan": nonTextChannel });

      const item = makeFeedItem({ title: "[Steam] Patch v2" });
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
      mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
      mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });

      await checkTrackedGames(client);

      expect(nonTextChannel.send).not.toHaveBeenCalled();
    });
  });

  describe("Persistance apres echec d'envoi", () => {
    it("persiste meme si le send echoue", async () => {
      const channel = makeMockTextChannel({
        id: "steam-epic-chan",
        send: vi.fn().mockRejectedValue(new Error("Discord rate limit")),
      });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "[Steam] Patch Error" });
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
      mockProcessedPatchNotesFindUnique.mockResolvedValue(null);
      mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });

      await checkTrackedGames(client);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining("Echec envoi")
      );
      // Persiste quand meme
      expect(mockProcessedPatchNotesCreate).toHaveBeenCalledWith({
        data: { guid: item.guid, title: item.title.slice(0, 255) },
      });
    });
  });

  describe("Erreur Prisma geree par isPatchProcessed", () => {
    it("log l'erreur critique si Prisma lance une exception imprevue", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item = makeFeedItem({ title: "[Steam] Patch DB Error" });
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item] }) });
      // Prisma throw sur findUnique
      mockProcessedPatchNotesFindUnique.mockRejectedValue(new Error("DB connection lost"));

      await checkTrackedGames(client);

      // isPatchProcessed catches DB errors internally and logs a warning
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Erreur verification")
      );
    });
  });

  describe("Resilience (plusieurs articles)", () => {
    it("traite plusieurs articles du flux RSS", async () => {
      const channel = makeMockTextChannel({ id: "steam-epic-chan" });
      const client = makeMockClient({ "steam-epic-chan": channel });

      const item1 = makeFeedItem({ guid: "guid-1", title: "[Steam] Patch A" });
      const item2 = makeFeedItem({ guid: "guid-2", title: "[Steam] Patch B" });
      const item3 = makeFeedItem({ guid: "guid-3", title: "[Steam] Patch C" });

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [item1, item2, item3] }) });

      // item1 connu, item2 et item3 nouveaux
      mockProcessedPatchNotesFindUnique
        .mockResolvedValueOnce({ id: 1 }) // item1 deja traite
        .mockResolvedValueOnce(null)       // item2 nouveau
        .mockResolvedValueOnce(null);      // item3 nouveau
      mockProcessedPatchNotesCreate.mockResolvedValue({ id: 1 });

      await checkTrackedGames(client);

      expect(channel.send).toHaveBeenCalledTimes(2);
    });
  });
});

// ─── Tests: startSteamNewsMonitoring / stopSteamNewsMonitoring ─────────────

describe("startSteamNewsMonitoring / stopSteamNewsMonitoring", () => {
  it("demarre et arrete la surveillance", () => {
    const client = makeMockClient();

    startSteamNewsMonitoring(client);

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining("Demarrage")
    );

    stopSteamNewsMonitoring();

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining("Arrete")
    );
  });

  it("empeche le double demarrage", () => {
    const client = makeMockClient();

    startSteamNewsMonitoring(client);
    startSteamNewsMonitoring(client);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("Deja actif")
    );
  });

  it("execute une premiere verification immediate au demarrage", async () => {
    const channel = makeMockTextChannel({ id: "steam-epic-chan" });
    const client = makeMockClient({ "steam-epic-chan": channel });

    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });

    startSteamNewsMonitoring(client);

    // Attendre le traitement des microtasks (la verification immediate est synchrone)
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalled();
  });
});
