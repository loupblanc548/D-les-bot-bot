/**
 * reportScheduler.test.ts — Tests du Report Scheduler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logs.js", () => ({ createLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("./socExtension.js", () => ({
  getGuildSecurityPosture: vi.fn().mockResolvedValue({
    guildId: "g1",
    globalThreatLevel: "LOW",
    threatScore: 5,
    metrics: [],
    activeIncidents: 0,
    resolvedIncidents: 0,
    honeypotsTriggered: 0,
    raidsDetected: 0,
    usersQuarantined: 0,
    lastIncidentAt: null,
  }),
  getEvents: vi.fn().mockReturnValue([]),
  calculateThreatScore: vi.fn().mockReturnValue({ score: 5, level: "LOW" }),
}));

vi.mock("./aiLogAnalyzer.js", () => ({
  getAnomalies: vi.fn().mockReturnValue([]),
  generateAnalysisReport: vi.fn().mockReturnValue({
    totalEntries: 100,
    errorCount: 5,
    warnCount: 10,
    topErrorSources: [],
    anomalies: [],
    patterns: [],
    generatedAt: new Date(),
  }),
}));

vi.mock("./autoDefense.js", () => ({
  getUnhealthyScrapers: vi.fn().mockReturnValue([]),
}));

import {
  addReportSchedule,
  removeReportSchedule,
  getReportConfigs,
  generateSecurityReport,
  buildReportEmbed,
  getReportHistory,
  clearReportHistory,
} from "./reportScheduler.js";

describe("Report Scheduler", () => {
  beforeEach(() => {
    clearReportHistory();
    vi.clearAllMocks();
  });

  describe("Schedule Management", () => {
    it("ajoute un schedule", () => {
      addReportSchedule({
        enabled: true,
        frequency: "DAILY",
        guildId: "g1",
        channelId: "ch1",
        sendAt: "08:00",
      });
      expect(getReportConfigs()).toHaveLength(1);
    });

    it("supprime un schedule", () => {
      addReportSchedule({
        enabled: true,
        frequency: "DAILY",
        guildId: "g1",
        channelId: "ch1",
        sendAt: "08:00",
      });
      expect(removeReportSchedule("g1", "DAILY")).toBe(true);
      expect(getReportConfigs()).toHaveLength(0);
    });
  });

  describe("generateSecurityReport", () => {
    it("génère un rapport quotidien", async () => {
      const report = await generateSecurityReport("g1", "DAILY");
      expect(report.frequency).toBe("DAILY");
      expect(report.metrics).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it("génère un rapport hebdomadaire", async () => {
      const report = await generateSecurityReport("g1", "WEEKLY");
      expect(report.frequency).toBe("WEEKLY");
    });
  });

  describe("buildReportEmbed", () => {
    it("génère un embed", async () => {
      const report = await generateSecurityReport("g1", "DAILY");
      const embed = buildReportEmbed(report);
      expect(embed).toBeDefined();
    });
  });

  describe("getReportHistory", () => {
    it("retourne l'historique", async () => {
      await generateSecurityReport("g1", "DAILY");
      expect(getReportHistory().length).toBeGreaterThan(0);
    });
  });
});
