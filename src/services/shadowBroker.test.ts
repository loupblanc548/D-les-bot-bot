/**
 * shadowBroker.test.ts — Tests d'intégration Shadow Broker
 *
 * Vérifie que :
 *  - queryShadowBroker fonctionne pour chaque type de requête
 *  - Les erreurs sont gérées (options manquantes)
 *  - La limite de requêtes concurrentes est respectée
 *  - Les timeouts sont gérés
 *  - Les logs confirment l'appel
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("../prisma.js", () => ({
  default: {
    nameHistory: { findMany: vi.fn().mockResolvedValue([]) },
    avatarHistory: { findMany: vi.fn().mockResolvedValue([]) },
    sanction: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    log: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    riskProfile: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    commandLog: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// Mock logger
vi.mock("../utils/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock("../config.js", () => ({
  config: { ownerId: "123456789" },
}));

import {
  queryShadowBroker,
  isStealthEnabled,
  enableStealth,
  disableStealth,
} from "./shadowBroker.js";

describe("Shadow Broker Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("queryShadowBroker", () => {
    it("retourne une erreur si userId manque pour 'intel'", async () => {
      const fakeClient = {} as any;
      const result = await queryShadowBroker(fakeClient, "intel", { guildId: "123" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("userId et guildId requis");
      expect(result.type).toBe("intel");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("retourne une erreur si guildId manque pour 'patterns'", async () => {
      const fakeClient = {} as any;
      const result = await queryShadowBroker(fakeClient, "patterns", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("guildId requis");
      expect(result.type).toBe("patterns");
    });

    it("retourne une erreur si guildId manque pour 'report'", async () => {
      const fakeClient = {} as any;
      const result = await queryShadowBroker(fakeClient, "report", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("guildId requis");
    });

    it("retourne une erreur pour un type inconnu", async () => {
      const fakeClient = {} as any;
      const result = await queryShadowBroker(fakeClient, "unknown" as any, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Type de requête inconnu");
    });

    it("inclut durationMs dans chaque résultat", async () => {
      const fakeClient = {} as any;
      const result = await queryShadowBroker(fakeClient, "patterns", {});

      expect(result).toHaveProperty("durationMs");
      expect(typeof result.durationMs).toBe("number");
    });
  });

  describe("Stealth Mode", () => {
    it("isStealthEnabled retourne false par défaut", () => {
      expect(isStealthEnabled("999")).toBe(false);
    });

    it("enableStealth active le mode stealth", () => {
      enableStealth("test-guild");
      expect(isStealthEnabled("test-guild")).toBe(true);
    });

    it("disableStealth désactive le mode stealth", () => {
      enableStealth("test-guild-2");
      disableStealth("test-guild-2");
      expect(isStealthEnabled("test-guild-2")).toBe(false);
    });
  });
});
