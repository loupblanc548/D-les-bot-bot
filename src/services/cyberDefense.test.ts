/**
 * cyberDefense.test.ts — Tests du module Cyber Defense & Honeypots
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logs.js", () => ({ createLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("./reportChannel.js", () => ({
  sendSecurityAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../prisma.js", () => ({
  default: {
    riskProfile: {
      findMany: vi.fn().mockResolvedValue([
        { userId: "123", riskScore: 100, riskLevel: "CRITIQUE", totalSanctions: 7 },
        { userId: "456", riskScore: 60, riskLevel: "ELEVE", totalSanctions: 5 },
      ]),
    },
    raidLog: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "raid1", guildId: "g1", detectedAt: new Date(), status: "active" },
        ]),
    },
  },
}));

import {
  registerHoneypot,
  deactivateHoneypot,
  triggerHoneypot,
  getActiveHoneypots,
  getTriggerHistory,
  clearHoneypots,
  generateThreatGraph,
  buildThreatGraphEmbed,
  executeAutoDefense,
} from "./cyberDefense.js";

const fakeClient = {
  guilds: {
    cache: {
      get: () => ({
        id: "g1",
        setVerificationLevel: vi.fn().mockResolvedValue(undefined),
        members: {
          fetch: vi.fn().mockResolvedValue({
            user: { tag: "Test#0001" },
            timeout: vi.fn().mockResolvedValue(undefined),
          }),
          ban: vi.fn().mockResolvedValue(undefined),
        },
      }),
    },
  },
} as any;

describe("Cyber Defense", () => {
  beforeEach(() => {
    clearHoneypots();
    vi.clearAllMocks();
  });

  describe("Honeypot Management", () => {
    it("enregistre un honeypot", async () => {
      const hp = await registerHoneypot("g1", "CHANNEL", "ch123", "#piège-test");
      expect(hp.type).toBe("CHANNEL");
      expect(hp.targetName).toBe("#piège-test");
      expect(hp.active).toBe(true);
      expect(getActiveHoneypots("g1")).toHaveLength(1);
    });

    it("désactive un honeypot", async () => {
      const hp = await registerHoneypot("g1", "ROLE", "r123", "RôlePiège");
      expect(deactivateHoneypot(hp.id)).toBe(true);
      expect(getActiveHoneypots("g1")).toHaveLength(0);
    });

    it("retourne false pour un honeypot inexistant", () => {
      expect(deactivateHoneypot("inexistant")).toBe(false);
    });
  });

  describe("Honeypot Trigger", () => {
    it("déclenche un honeypot et incrémente le compteur", async () => {
      const hp = await registerHoneypot("g1", "CHANNEL", "ch123", "#piège");
      await triggerHoneypot(hp.id, "user1", fakeClient);
      expect(hp.triggeredCount).toBe(1);
      expect(hp.lastTriggeredAt).not.toBeNull();
      expect(getTriggerHistory(hp.id)).toHaveLength(1);
    });

    it("retourne null pour un honeypot inactif", async () => {
      const hp = await registerHoneypot("g1", "CHANNEL", "ch123", "#piège");
      deactivateHoneypot(hp.id);
      const result = await triggerHoneypot(hp.id, "user1", fakeClient);
      expect(result).toBeNull();
    });

    it("déclenche une défense auto après 3 triggers en 1min", async () => {
      const hp = await registerHoneypot("g1", "CHANNEL", "ch123", "#piège");
      await triggerHoneypot(hp.id, "user1", fakeClient);
      await triggerHoneypot(hp.id, "user1", fakeClient);
      const action = await triggerHoneypot(hp.id, "user1", fakeClient);
      expect(action).not.toBeNull();
      expect(action?.type).toBe("QUARANTINE");
    });
  });

  describe("Threat Graph", () => {
    it("génère un graphe avec honeypots et users suspects", async () => {
      await registerHoneypot("g1", "CHANNEL", "ch1", "#piège1");
      const graph = await generateThreatGraph(fakeClient, "g1");
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.nodes.some((n) => n.type === "honeypot")).toBe(true);
      expect(graph.nodes.some((n) => n.type === "user")).toBe(true);
      expect(graph.nodes.some((n) => n.type === "raid")).toBe(true);
    });

    it("buildThreatGraphEmbed génère un embed", async () => {
      await registerHoneypot("g1", "CHANNEL", "ch1", "#piège1");
      const graph = await generateThreatGraph(fakeClient, "g1");
      const embed = buildThreatGraphEmbed(graph);
      expect(embed).toBeDefined();
    });
  });

  describe("Auto Defense", () => {
    it("exécute un LOCKDOWN", async () => {
      const action = await executeAutoDefense(fakeClient, "g1", "LOCKDOWN", [], "Test lockdown");
      expect(action.type).toBe("LOCKDOWN");
      expect(action.result).toContain("Lockdown");
    });

    it("exécute un ALERT_ONLY", async () => {
      const action = await executeAutoDefense(fakeClient, "g1", "ALERT_ONLY", [], "Test alert");
      expect(action.type).toBe("ALERT_ONLY");
      expect(action.result).toContain("Alerte");
    });
  });
});
