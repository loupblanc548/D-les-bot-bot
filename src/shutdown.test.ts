import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockPrisma, mockSentry, mockServices } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockPrisma: { $disconnect: vi.fn().mockResolvedValue(undefined) },
  mockSentry: { close: vi.fn().mockResolvedValue(undefined), captureException: vi.fn() },
  mockServices: {
    stopMonitoring: vi.fn(),
    stopTwitchMonitoring: vi.fn(),
    stopPatchNotesService: vi.fn(),
    stopInstantGamingCheck: vi.fn(),
    stopInstantGamingNewsCheck: vi.fn(),
    stopSteamNewsMonitoring: vi.fn(),
    stopFreeGamesMonitoring: vi.fn(),
    stopDealsMonitoring: vi.fn(),
    stopGlobalPatchNotesMonitoring: vi.fn(),
    stopMonthlyMaintenance: vi.fn(),
    stopTwitterMonitoring: vi.fn(),
    stopMapCleanup: vi.fn(),
  },
}));

vi.mock("./utils/logger", () => ({ default: mockLogger }));
vi.mock("./prisma", () => ({ default: mockPrisma }));
vi.mock("@sentry/node", () => ({
  default: mockSentry,
  close: mockSentry.close,
  captureException: mockSentry.captureException,
}));
vi.mock("./services/monitor", () => ({ stopMonitoring: mockServices.stopMonitoring }));
vi.mock("./services/twitch", () => ({ stopTwitchMonitoring: mockServices.stopTwitchMonitoring }));
vi.mock("./services/patchNotes", () => ({
  stopPatchNotesService: mockServices.stopPatchNotesService,
}));
vi.mock("./services/instantgaming", () => ({
  stopInstantGamingCheck: mockServices.stopInstantGamingCheck,
}));
vi.mock("./services/instantgaming-news", () => ({
  stopInstantGamingNewsCheck: mockServices.stopInstantGamingNewsCheck,
}));
vi.mock("./cron/steamNewsCron", () => ({
  stopSteamNewsMonitoring: mockServices.stopSteamNewsMonitoring,
}));
vi.mock("./cron/freeGamesCron", () => ({
  stopFreeGamesMonitoring: mockServices.stopFreeGamesMonitoring,
}));
vi.mock("./cron/dealsCron", () => ({ stopDealsMonitoring: mockServices.stopDealsMonitoring }));
vi.mock("./cron/globalPatchNotesCron", () => ({
  stopGlobalPatchNotesMonitoring: mockServices.stopGlobalPatchNotesMonitoring,
}));
vi.mock("./cron/monthlyMaintenance", () => ({
  stopMonthlyMaintenance: mockServices.stopMonthlyMaintenance,
}));
vi.mock("./cron/twitterCron", () => ({
  stopTwitterMonitoring: mockServices.stopTwitterMonitoring,
}));
vi.mock("./events/messages", () => ({ stopMapCleanup: mockServices.stopMapCleanup }));

import { attachShutdownHandlers, registerDestroyClient, registerInterval } from "./shutdown.js";

describe("shutdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerDestroyClient", () => {
    it("stocke la fonction de destruction du client", () => {
      const destroyFn = vi.fn();
      registerDestroyClient(destroyFn);
      // Vérifié indirectement via le shutdown
    });
  });

  describe("registerInterval", () => {
    it("stocke un intervalle pour le nettoyage", () => {
      const interval = setInterval(() => {}, 1000);
      registerInterval(interval);
      clearInterval(interval);
    });

    it("ignore les intervalles null", () => {
      registerInterval(null);
      // Aucune erreur = test passé
    });
  });

  describe("attachShutdownHandlers", () => {
    let processOnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process as any);
    });

    it("enregistre les handlers SIGINT et SIGTERM", () => {
      attachShutdownHandlers();
      expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    });
  });

  describe("gracefulShutdown (via SIGINT)", () => {
    let originalExit: typeof process.exit;
    let processOnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      originalExit = process.exit;
      process.exit = vi.fn() as any;
      processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process as any);
    });

    afterEach(() => {
      process.exit = originalExit;
    });

    it("arrête tous les services monitoring lors du signal SIGINT", async () => {
      attachShutdownHandlers();

      // Récupérer le handler SIGINT
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "SIGINT")?.[1] as (
        ...args: unknown[]
      ) => unknown;
      expect(handler).toBeDefined();

      await handler();

      // Vérifie que tous les services d'arrêt sont appelés
      expect(mockServices.stopMonitoring).toHaveBeenCalled();
      expect(mockServices.stopTwitchMonitoring).toHaveBeenCalled();
      expect(mockServices.stopPatchNotesService).toHaveBeenCalled();
      expect(mockServices.stopInstantGamingCheck).toHaveBeenCalled();
      expect(mockServices.stopInstantGamingNewsCheck).toHaveBeenCalled();
      expect(mockServices.stopSteamNewsMonitoring).toHaveBeenCalled();
      expect(mockServices.stopFreeGamesMonitoring).toHaveBeenCalled();
      expect(mockServices.stopDealsMonitoring).toHaveBeenCalled();
      expect(mockServices.stopGlobalPatchNotesMonitoring).toHaveBeenCalled();
      expect(mockServices.stopMonthlyMaintenance).toHaveBeenCalled();
      expect(mockServices.stopTwitterMonitoring).toHaveBeenCalled();
      expect(mockServices.stopMapCleanup).toHaveBeenCalled();
    });

    it("déconnecte Prisma et ferme Sentry lors du shutdown", async () => {
      attachShutdownHandlers();
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "SIGINT")?.[1] as (
        ...args: unknown[]
      ) => unknown;

      await handler();

      expect(mockPrisma.$disconnect).toHaveBeenCalled();
      expect(mockSentry.close).toHaveBeenCalledWith(2000);
    });

    it("appelle process.exit(0) après le shutdown", async () => {
      attachShutdownHandlers();
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "SIGINT")?.[1] as (
        ...args: unknown[]
      ) => unknown;

      await handler();

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it("nettoie les intervalles enregistrés", async () => {
      const { registerInterval } = await import("./shutdown.js");

      const interval = setInterval(() => {}, 100000);
      registerInterval(interval);

      const clearSpy = vi.spyOn(global, "clearInterval");

      attachShutdownHandlers();
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "SIGINT")?.[1] as (
        ...args: unknown[]
      ) => unknown;
      await handler();

      expect(clearSpy).toHaveBeenCalledWith(interval);
      clearInterval(interval);
    });

    it("appelle la fonction destroyClient si enregistrée", async () => {
      const destroyFn = vi.fn();
      registerDestroyClient(destroyFn);

      attachShutdownHandlers();
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "SIGINT")?.[1] as (
        ...args: unknown[]
      ) => unknown;
      await handler();

      expect(destroyFn).toHaveBeenCalled();
    });

    it("continue même si un service d'arrêt lance une erreur", async () => {
      mockServices.stopMonitoring.mockImplementationOnce(() => {
        throw new Error("Stop failed");
      });

      attachShutdownHandlers();
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "SIGINT")?.[1] as (
        ...args: unknown[]
      ) => unknown;

      await expect(handler()).resolves.not.toThrow();
      // Les autres services doivent quand même être arrêtés
      expect(mockServices.stopTwitchMonitoring).toHaveBeenCalled();
    });
  });
});
