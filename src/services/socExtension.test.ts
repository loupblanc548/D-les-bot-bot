/**
 * socExtension.test.ts — Tests du SOC Extension
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logs.js", () => ({ createLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("../prisma.js", () => ({
  default: {
    riskProfile: {
      count: vi.fn().mockImplementation((args) => {
        if (args?.where?.riskLevel === "CRITIQUE") return Promise.resolve(3);
        if (args?.where?.riskLevel === "ELEVE") return Promise.resolve(7);
        return Promise.resolve(0);
      }),
    },
    alert: {
      count: vi.fn().mockResolvedValue(5),
    },
  },
}));

import {
  recordSecurityEvent,
  calculateThreatScore,
  getSecurityMetrics,
  getGuildSecurityPosture,
  getIncidentTimeline,
  getEvents,
  clearEvents,
  checkEscalation,
  buildSOCEmbed,
} from "./socExtension.js";

describe("SOC Extension", () => {
  beforeEach(() => {
    clearEvents();
    vi.clearAllMocks();
  });

  describe("recordSecurityEvent", () => {
    it("enregistre un événement", () => {
      const event = recordSecurityEvent({
        guildId: "g1",
        type: "RAID",
        severity: "HIGH",
        source: "antiRaid",
        message: "Raid détecté",
        metadata: {},
      });
      expect(event.id).toMatch(/^soc_/);
      expect(event.type).toBe("RAID");
      expect(event.severity).toBe("HIGH");
    });

    it("stocke l'événement dans le store", () => {
      recordSecurityEvent({
        guildId: "g1",
        type: "HONEYPOT",
        severity: "MEDIUM",
        source: "cyberDefense",
        message: "Honeypot triggered",
        metadata: {},
      });
      expect(getEvents("g1")).toHaveLength(1);
    });
  });

  describe("calculateThreatScore", () => {
    it("retourne LOW sans événements", () => {
      const { score, level } = calculateThreatScore("g1");
      expect(score).toBe(0);
      expect(level).toBe("LOW");
    });

    it("calcule le score avec événements", () => {
      recordSecurityEvent({
        guildId: "g1",
        type: "RAID",
        severity: "CRITICAL",
        source: "test",
        message: "test",
        metadata: {},
      });
      recordSecurityEvent({
        guildId: "g1",
        type: "SPAM",
        severity: "MEDIUM",
        source: "test",
        message: "test",
        metadata: {},
      });
      const { score, level } = calculateThreatScore("g1");
      expect(score).toBe(55); // 50 + 5
      expect(level).toBe("HIGH");
    });

    it("atteint CRITICAL avec score >= 100", () => {
      for (let i = 0; i < 3; i++) {
        recordSecurityEvent({
          guildId: "g1",
          type: "RAID",
          severity: "CRITICAL",
          source: "test",
          message: "test",
          metadata: {},
        });
      }
      const { score, level } = calculateThreatScore("g1");
      expect(score).toBe(150);
      expect(level).toBe("CRITICAL");
    });
  });

  describe("getSecurityMetrics", () => {
    it("retourne des métriques", async () => {
      recordSecurityEvent({
        guildId: "g1",
        type: "RAID",
        severity: "HIGH",
        source: "test",
        message: "test",
        metadata: {},
      });
      const metrics = await getSecurityMetrics("g1");
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics.some((m) => m.key === "total_events")).toBe(true);
      expect(metrics.some((m) => m.key === "critical_profiles")).toBe(true);
      expect(metrics.some((m) => m.key === "pending_alerts")).toBe(true);
    });
  });

  describe("getGuildSecurityPosture", () => {
    it("génère une posture complète", async () => {
      recordSecurityEvent({
        guildId: "g1",
        type: "RAID",
        severity: "HIGH",
        source: "test",
        message: "test",
        metadata: {},
      });
      recordSecurityEvent({
        guildId: "g1",
        type: "QUARANTINE",
        severity: "MEDIUM",
        source: "test",
        message: "test",
        metadata: {},
      });
      const posture = await getGuildSecurityPosture("g1");
      expect(posture.guildId).toBe("g1");
      expect(posture.metrics.length).toBeGreaterThan(0);
      expect(posture.raidsDetected).toBe(1);
      expect(posture.usersQuarantined).toBe(1);
    });
  });

  describe("getIncidentTimeline", () => {
    it("génère une timeline", () => {
      recordSecurityEvent({
        guildId: "g1",
        type: "RAID",
        severity: "HIGH",
        source: "test",
        message: "test",
        metadata: {},
      });
      const timeline = getIncidentTimeline("g1");
      expect(timeline.events).toHaveLength(1);
      expect(timeline.totalThreats).toBe(1);
    });
  });

  describe("checkEscalation", () => {
    it("déclenche une escalade CRITICAL", async () => {
      for (let i = 0; i < 4; i++) {
        recordSecurityEvent({
          guildId: "g1",
          type: "RAID",
          severity: "CRITICAL",
          source: "test",
          message: "test",
          metadata: {},
        });
      }
      const result = await checkEscalation({} as any, "g1");
      expect(result).toBe("CRITICAL");
    });

    it("ne déclenche pas d'escalade sans score suffisant", async () => {
      recordSecurityEvent({
        guildId: "g1",
        type: "SPAM",
        severity: "LOW",
        source: "test",
        message: "test",
        metadata: {},
      });
      const result = await checkEscalation({} as any, "g1");
      expect(result).toBeNull();
    });
  });

  describe("buildSOCEmbed", () => {
    it("génère un embed", async () => {
      const posture = await getGuildSecurityPosture("g1");
      const embed = buildSOCEmbed(posture);
      expect(embed).toBeDefined();
    });
  });
});
