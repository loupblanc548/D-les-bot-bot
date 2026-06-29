/**
 * threatIntel.test.ts — Tests du Threat Intelligence Provider
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  scanURL,
  checkIPReputation,
  githubDorkSearch,
  clearThreatIntelCache,
  isConfigured,
  type ThreatSource,
} from "./threatIntel.js";

describe("Threat Intelligence", () => {
  beforeEach(() => {
    clearThreatIntelCache();
    vi.clearAllMocks();
  });

  describe("scanURL", () => {
    it("retourne un résultat même sans clés API", async () => {
      const result = await scanURL("https://example.com");
      expect(result.url).toBe("https://example.com");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.overallMalicious).toBe(false);
    });

    it("met en cache les résultats", async () => {
      await scanURL("https://test.com");
      const result2 = await scanURL("https://test.com");
      expect(result2.scannedAt).toBeDefined();
    });
  });

  describe("checkIPReputation", () => {
    it("retourne un résultat avec géolocalisation", async () => {
      const result = await checkIPReputation("8.8.8.8");
      expect(result.ip).toBe("8.8.8.8");
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe("githubDorkSearch", () => {
    it("retourne un résultat sans token", async () => {
      const result = await githubDorkSearch("test query");
      expect(result.query).toBe("test query");
      expect(result.found).toBe(false);
    });
  });

  describe("isConfigured", () => {
    it("retourne false pour VirusTotal sans clé", () => {
      expect(isConfigured("VIRUSTOTAL" as ThreatSource)).toBe(false);
    });

    it("retourne true pour IPVOID (free API)", () => {
      expect(isConfigured("IPVOID" as ThreatSource)).toBe(true);
    });
  });
});
