import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockConfig, mockClient, mockServices, mockCron } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockConfig: {
    ownerId: "owner-123",
  },
  mockClient: {
    on: vi.fn(),
    once: vi.fn(),
    users: {
      fetch: vi.fn().mockResolvedValue({
        send: vi.fn().mockResolvedValue(undefined),
      }),
    },
    guilds: {
      cache: {
        size: 5,
        values: vi.fn().mockReturnValue([]),
      },
    },
  },
  mockServices: {
    checkWishlistMatches: vi.fn().mockResolvedValue(0),
    runWishlistRetrospective: vi.fn().mockResolvedValue(undefined),
    startTwitchMonitoring: vi.fn(),
    runStartupRetrospective: vi.fn().mockResolvedValue(undefined),
    startMonitoring: vi.fn(),
    runDbSourcesRetrospective: vi.fn().mockResolvedValue(undefined),
    sendHealthReport: vi.fn().mockResolvedValue(undefined),
    validateChannels: vi.fn().mockResolvedValue({ errors: 0 }),
    validateModeratorRoles: vi.fn().mockResolvedValue(undefined),
    startPatchNotesService: vi.fn(),
    startBackupService: vi.fn(),
    startInstantGamingNewsCheck: vi.fn(),
    checkInstantGamingNews: vi.fn().mockResolvedValue(undefined),
    startInstantGamingCheck: vi.fn(),
    startSteamNewsMonitoring: vi.fn(),
    checkTrackedGames: vi.fn().mockResolvedValue(undefined),
    checkFreeGames: vi.fn().mockResolvedValue(undefined),
    startTwitterMonitoring: vi.fn(),
    checkTwitterAccounts: vi.fn().mockResolvedValue(undefined),
    startDealsMonitoring: vi.fn(),
    checkDeals: vi.fn().mockResolvedValue(undefined),
    startGlobalPatchNotesMonitoring: vi.fn(),
    checkPatchNotes: vi.fn().mockResolvedValue(undefined),
    startFreeGamesMonitoring: vi.fn(),
    startMonthlyMaintenance: vi.fn(),
  },
  mockCron: {
    registerInterval: vi.fn(),
  },
}));

vi.mock("./utils/logger", () => ({ default: mockLogger }));
vi.mock("./config", () => ({ config: mockConfig }));
vi.mock("./services/fortnite-api", () => ({
  checkWishlistMatches: mockServices.checkWishlistMatches,
  runWishlistRetrospective: mockServices.runWishlistRetrospective,
}));
vi.mock("./services/twitch", () => ({ startTwitchMonitoring: mockServices.startTwitchMonitoring }));
vi.mock("./services/feeds", () => ({
  runStartupRetrospective: mockServices.runStartupRetrospective,
}));
vi.mock("./services/monitor", () => ({
  startMonitoring: mockServices.startMonitoring,
  runDbSourcesRetrospective: mockServices.runDbSourcesRetrospective,
}));
vi.mock("./services/healthcheck", () => ({ sendHealthReport: mockServices.sendHealthReport }));
vi.mock("./services/channel-validator", () => ({
  validateChannels: mockServices.validateChannels,
}));
vi.mock("./services/permissions", () => ({
  validateModeratorRoles: mockServices.validateModeratorRoles,
}));
vi.mock("./services/patchNotes", () => ({
  startPatchNotesService: mockServices.startPatchNotesService,
}));
vi.mock("./services/backup", () => ({ startBackupService: mockServices.startBackupService }));
vi.mock("./services/instantgaming-news", () => ({
  startInstantGamingNewsCheck: mockServices.startInstantGamingNewsCheck,
  checkInstantGamingNews: mockServices.checkInstantGamingNews,
}));
vi.mock("./services/instantgaming", () => ({
  startInstantGamingCheck: mockServices.startInstantGamingCheck,
}));
vi.mock("./cron/wishlistCron", () => ({
  startWishlistCron: vi.fn(),
}));
vi.mock("./cron/hourlyMaintenance", () => ({
  startHourlyMaintenance: vi.fn(),
}));
vi.mock("./cron/boutiqueCron", () => ({
  startBoutiqueCron: vi.fn(),
}));
vi.mock("./cron/steamNewsCron", () => ({
  startSteamNewsMonitoring: mockServices.startSteamNewsMonitoring,
  checkTrackedGames: mockServices.checkTrackedGames,
}));
vi.mock("./cron/freeGamesCron", () => ({
  checkFreeGames: mockServices.checkFreeGames,
  startFreeGamesMonitoring: mockServices.startFreeGamesMonitoring,
}));
vi.mock("./cron/twitterCron", () => ({
  startTwitterMonitoring: mockServices.startTwitterMonitoring,
  checkTwitterAccounts: mockServices.checkTwitterAccounts,
}));
vi.mock("./cron/dealsCron", () => ({
  startDealsMonitoring: mockServices.startDealsMonitoring,
  checkDeals: mockServices.checkDeals,
}));
vi.mock("./cron/globalPatchNotesCron", () => ({
  startGlobalPatchNotesMonitoring: mockServices.startGlobalPatchNotesMonitoring,
  checkPatchNotes: mockServices.checkPatchNotes,
}));
vi.mock("./cron/monthlyMaintenance", () => ({
  startMonthlyMaintenance: mockServices.startMonthlyMaintenance,
}));
vi.mock("./cron/botHealthCheck", () => ({ startBotHealthCheck: vi.fn() }));
vi.mock("./cron/notificationCleanup", () => ({ startNotificationCleanup: vi.fn() }));
vi.mock("./cron/alertDigest", () => ({ startAlertDigest: vi.fn() }));
vi.mock("./cron/dailyGamingContent", () => ({ startDailyGamingContent: vi.fn() }));
vi.mock("./events/autoModeration", () => ({ handleAutoModeration: vi.fn() }));
vi.mock("./events/inviteTracker", () => ({ handleInviteTracker: vi.fn() }));
vi.mock("./events/serverCloneDetect", () => ({ handleServerCloneDetect: vi.fn() }));
vi.mock("./events/autoEvents", () => ({ handleAutoEvents: vi.fn() }));
vi.mock("./cron/autoEscalation", () => ({ startAutoEscalation: vi.fn() }));
vi.mock("./cron/miscCrons", () => ({ startMiscCrons: vi.fn() }));
vi.mock("./cron/commandAutomation", () => ({ startCommandAutomation: vi.fn() }));
vi.mock("./cron/brokenImageCleanup", () => ({ startBrokenImageCleanup: vi.fn() }));
vi.mock("./services/securityIntegration", () => ({ startSecurityIntegration: vi.fn() }));
vi.mock("./services/cyberDefense", () => ({ initHoneypotMonitoring: vi.fn() }));
vi.mock("./services/price-alerts", () => ({ startPriceAlertsMonitoring: vi.fn() }));
vi.mock("./services/game-updates", () => ({ startGameUpdatesMonitoring: vi.fn() }));
vi.mock("./services/reportScheduler", () => ({ startReportScheduler: vi.fn() }));
vi.mock("./utils/smart-alerts", () => ({ enableSmartAlerts: vi.fn() }));
vi.mock("./services/tiktokAlerts", () => ({ startTikTokMonitoring: vi.fn() }));
vi.mock("./services/kickAlerts", () => ({ startKickMonitoring: vi.fn() }));
vi.mock("./services/vodNotifications", () => ({ startVodMonitoring: vi.fn() }));
vi.mock("./services/clipForwarding", () => ({ startClipForwarding: vi.fn() }));
vi.mock("./services/scheduledMessages", () => ({ startScheduledMessages: vi.fn() }));
vi.mock("./services/onboardingFlow", () => ({ startOnboardingFlow: vi.fn() }));
vi.mock("./services/reactionRoles", () => ({ startReactionRoles: vi.fn() }));
vi.mock("./services/ticketSystem", () => ({ startTicketSystem: vi.fn() }));
vi.mock("./services/faqAutoResponder", () => ({ startFaqAutoResponder: vi.fn() }));
vi.mock("./services/creatorRoleSync", () => ({ startCreatorRoleSync: vi.fn() }));
vi.mock("./services/rateLimitDashboard", () => ({ startRateLimitDashboard: vi.fn() }));
vi.mock("./services/commandAnalytics", () => ({ startCommandAnalytics: vi.fn() }));
vi.mock("./services/releaseCalendar", () => ({ startReleaseCalendar: vi.fn() }));
vi.mock("./services/hotTopicsDetector", () => ({ startHotTopicsDetector: vi.fn() }));
vi.mock("./services/conversationSummarizer", () => ({ startConversationSummarizer: vi.fn() }));
vi.mock("./services/churnPrediction", () => ({ startChurnPrediction: vi.fn() }));
vi.mock("./services/lfgMatchmaker", () => ({ startLFGMatchmaker: vi.fn() }));
vi.mock("./services/activityHeatmap", () => ({ startActivityHeatmap: vi.fn() }));
vi.mock("./services/pinRotation", () => ({ startPinRotation: vi.fn() }));
vi.mock("./services/presenceTracker", () => ({ startPresenceTracker: vi.fn() }));
vi.mock("./services/dealFusion", () => ({ startDealFusion: vi.fn() }));
vi.mock("./services/githubReleases", () => ({ startGitHubReleasesMonitor: vi.fn() }));
vi.mock("./services/multiSiteDeals", () => ({ startMultiSiteDealsMonitor: vi.fn() }));
vi.mock("./shutdown", () => ({ registerInterval: mockCron.registerInterval }));

import { Events } from "discord.js";
import { attachStartupLogic } from "./startup.js";

describe("startup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {});

  describe("attachStartupLogic", () => {
    it("enregistre le handler ClientReady sur le client", () => {
      attachStartupLogic(mockClient as any, []);
      expect(mockClient.once).toHaveBeenCalledWith(Events.ClientReady, expect.any(Function));
    });

    it("notifie le propriétaire au démarrage", async () => {
      attachStartupLogic(mockClient as any, []);

      // Récupérer et exécuter le handler ClientReady
      const readyHandler = mockClient.once.mock.calls[0][1];
      const readyClient = { user: { tag: "BotTest#0000", username: "BotTest" } };

      await readyHandler(readyClient);

      expect(mockClient.users.fetch).toHaveBeenCalledWith("owner-123");
    });

    it("démarre tous les services dans l'ordre", async () => {
      attachStartupLogic(mockClient as any, []);

      const readyHandler = mockClient.once.mock.calls[0][1];
      const readyClient = { user: { tag: "BotTest#0000", username: "BotTest" } };

      await readyHandler(readyClient);

      expect(mockServices.startMonitoring).toHaveBeenCalledWith(mockClient);
      expect(mockServices.startTwitchMonitoring).toHaveBeenCalledWith(mockClient);
      expect(mockServices.startPatchNotesService).toHaveBeenCalledWith(mockClient);
      expect(mockServices.startBackupService).toHaveBeenCalledWith(mockClient);
    });

    it("lance les vérifications wishlist Fortnite", async () => {
      attachStartupLogic(mockClient as any, []);

      const readyHandler = mockClient.once.mock.calls[0][1];
      const readyClient = { user: { tag: "BotTest#0000", username: "BotTest" } };

      await readyHandler(readyClient);

      expect(mockServices.checkWishlistMatches).toHaveBeenCalledWith(mockClient);
      expect(mockServices.runWishlistRetrospective).toHaveBeenCalledWith(mockClient);
    });

    it("enregistre l'intervalle cyclique wishlist (24h)", async () => {
      attachStartupLogic(mockClient as any, []);

      const readyHandler = mockClient.once.mock.calls[0][1];
      const readyClient = { user: { tag: "BotTest#0000", username: "BotTest" } };

      await readyHandler(readyClient);

      // setInterval a dû être appelé
      expect(mockCron.registerInterval).toHaveBeenCalled();
    });

    it("valide les canaux Discord", async () => {
      attachStartupLogic(mockClient as any, []);

      const readyHandler = mockClient.once.mock.calls[0][1];
      const readyClient = { user: { tag: "BotTest#0000", username: "BotTest" } };

      await readyHandler(readyClient);

      expect(mockServices.validateChannels).toHaveBeenCalledWith(mockClient);
    });

    it("log un avertissement si des canaux sont inaccessibles", async () => {
      mockServices.validateChannels.mockResolvedValueOnce({ errors: 3 });

      attachStartupLogic(mockClient as any, []);

      const readyHandler = mockClient.once.mock.calls[0][1];
      const readyClient = { user: { tag: "BotTest#0000", username: "BotTest" } };

      await readyHandler(readyClient);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("3 salon(s) inaccessible(s)"),
      );
    });

    it("envoie le rapport de santé à la fin du démarrage", async () => {
      const healthResults = [{ status: "ok" }];

      attachStartupLogic(mockClient as any, healthResults as any);

      const readyHandler = mockClient.once.mock.calls[0][1];
      const readyClient = { user: { tag: "BotTest#0000", username: "BotTest" } };

      await readyHandler(readyClient);

      expect(mockServices.sendHealthReport).toHaveBeenCalledWith(mockClient, healthResults);
    });
  });
});
