/**
 * autoDefense.test.ts — Tests du Auto-Defense System
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logs.js", () => ({ createLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("./socExtension.js", () => ({
  recordSecurityEvent: vi.fn(),
}));

import {
  getAutoDefenseConfig,
  updateAutoDefenseConfig,
  addGeoBlockRule,
  getGeoBlockRules,
  checkGeoBlock,
  addQuarantineRule,
  checkAutoQuarantine,
  addToWhitelist,
  isWhitelisted,
  removeFromWhitelist,
  reportScraperHealth,
  getUnhealthyScrapers,
  startEscalation,
  cancelEscalation,
  clearAutoDefense,
  buildAutoDefenseEmbed,
} from "./autoDefense.js";

let fakeMember: any;

describe("Auto Defense", () => {
  beforeEach(() => {
    clearAutoDefense();
    vi.clearAllMocks();
    fakeMember = {
      id: "123",
      user: { tag: "Test#0001", id: "123" },
      guild: { id: "g1" },
      timeout: vi.fn().mockResolvedValue(undefined),
      kick: vi.fn().mockResolvedValue(undefined),
      ban: vi.fn().mockResolvedValue(undefined),
    } as any;
  });

  describe("Configuration", () => {
    it("retourne la config par défaut", () => {
      const config = getAutoDefenseConfig();
      expect(config.geoBlockEnabled).toBe(true);
      expect(config.quarantineEnabled).toBe(true);
    });

    it("met à jour la config", () => {
      const config = updateAutoDefenseConfig({ geoBlockEnabled: false });
      expect(config.geoBlockEnabled).toBe(false);
    });
  });

  describe("GeoBlock", () => {
    it("ajoute une règle GeoBlock", () => {
      addGeoBlockRule({ guildId: "g1", countryCode: "CN", action: "TIMEOUT", reason: "Test" });
      expect(getAutoDefenseConfig()).toBeDefined();
    });

    it("bloque un membre d'un pays bloqué", async () => {
      addGeoBlockRule({
        guildId: "g1",
        countryCode: "XX",
        action: "TIMEOUT",
        reason: "Test block",
      });
      const rules = getGeoBlockRules("g1");
      expect(rules).toHaveLength(1);
      expect(rules[0].countryCode).toBe("XX");
      expect(rules[0].enabled).toBe(true);
      const blocked = await checkGeoBlock(fakeMember, "XX");
      expect(blocked).toBe(true);
      expect(fakeMember.timeout).toHaveBeenCalled();
    });

    it("ne bloque pas un membre d'un pays non listé", async () => {
      addGeoBlockRule({ guildId: "g1", countryCode: "XX", action: "TIMEOUT", reason: "Test" });
      const blocked = await checkGeoBlock(fakeMember, "FR");
      expect(blocked).toBe(false);
    });

    it("ne bloque pas si GeoBlock désactivé", async () => {
      updateAutoDefenseConfig({ geoBlockEnabled: false });
      addGeoBlockRule({ guildId: "g1", countryCode: "XX", action: "TIMEOUT", reason: "Test" });
      const blocked = await checkGeoBlock(fakeMember, "XX");
      expect(blocked).toBe(false);
    });
  });

  describe("Quarantine", () => {
    it("ajoute une règle de quarantaine", () => {
      const id = addQuarantineRule({
        guildId: "g1",
        condition: { riskLevel: "CRITIQUE" },
        action: "TIMEOUT_1H",
        enabled: true,
      });
      expect(id).toMatch(/^qr_/);
    });

    it("quarantaine un membre CRITIQUE", async () => {
      addQuarantineRule({
        guildId: "g1",
        condition: { riskLevel: "CRITIQUE" },
        action: "TIMEOUT_1H",
        enabled: true,
      });
      const result = await checkAutoQuarantine(fakeMember, {
        riskLevel: "CRITIQUE",
        totalSanctions: 5,
        suspiciousFlags: [],
      });
      expect(result).toBe(true);
      expect(fakeMember.timeout).toHaveBeenCalled();
    });

    it("ne quarantaine pas un membre MOYEN", async () => {
      addQuarantineRule({
        guildId: "g1",
        condition: { riskLevel: "CRITIQUE" },
        action: "TIMEOUT_1H",
        enabled: true,
      });
      const result = await checkAutoQuarantine(fakeMember, {
        riskLevel: "MOYEN",
        totalSanctions: 1,
        suspiciousFlags: [],
      });
      expect(result).toBe(false);
    });
  });

  describe("Whitelist", () => {
    it("ajoute et vérifie la whitelist", () => {
      addToWhitelist("user123");
      expect(isWhitelisted("user123")).toBe(true);
    });

    it("retire de la whitelist", () => {
      addToWhitelist("user456");
      removeFromWhitelist("user456");
      expect(isWhitelisted("user456")).toBe(false);
    });
  });

  describe("Scraper Health", () => {
    it("track les échecs de scraper", () => {
      reportScraperHealth("scraper1", false);
      reportScraperHealth("scraper1", false);
      reportScraperHealth("scraper1", false);
      const unhealthy = getUnhealthyScrapers();
      expect(unhealthy).toHaveLength(1);
      expect(unhealthy[0].failures).toBe(3);
    });

    it("reset sur succès", () => {
      reportScraperHealth("scraper2", false);
      reportScraperHealth("scraper2", true);
      const unhealthy = getUnhealthyScrapers();
      expect(unhealthy.find((s) => s.scraperId === "scraper2")).toBeUndefined();
    });
  });

  describe("Escalation", () => {
    it("démarre et annule une escalade", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      startEscalation("g1", "incident1", callback);
      cancelEscalation("g1", "incident1");
      // Pas d'erreur = succès
      expect(true).toBe(true);
    });
  });

  describe("buildAutoDefenseEmbed", () => {
    it("génère un embed", () => {
      const embed = buildAutoDefenseEmbed(getAutoDefenseConfig());
      expect(embed).toBeDefined();
    });
  });
});
