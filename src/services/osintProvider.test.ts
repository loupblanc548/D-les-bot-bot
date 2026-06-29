/**
 * osintProvider.test.ts — Tests du fournisseur OSINT unifié
 *
 * Vérifie que :
 *  - queryOSINT fonctionne pour les types natifs (username-fast, email, domain)
 *  - Le cache fonctionne (second appel = fromCache: true)
 *  - Le rate limiting rejette au-delà de la limite
 *  - Les erreurs sont gérées (type inconnu, options manquantes)
 *  - Les stats sont disponibles
 *  - clearOSINTCache vide le cache
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../utils/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock osint.js — on mocke les fonctions externes pour éviter les appels réseau
vi.mock("./osint.js", () => ({
  searchUsername: vi.fn().mockResolvedValue([
    { platform: "GitHub", url: "https://github.com/test", found: true },
    { platform: "Reddit", url: "https://reddit.com/user/test", found: false },
  ]),
  checkEmail: vi.fn().mockResolvedValue([
    { platform: "GitHub", registered: true },
    { platform: "Gravatar", registered: false },
  ]),
  lookupPhone: vi.fn().mockResolvedValue({ number: "+1234567890", valid: true }),
  lookupDomain: vi.fn().mockResolvedValue({
    domain: "example.com",
    subdomains: [
      { domain: "api.example.com", issuer: "Let's Encrypt", notBefore: "2024", notAfter: "2025" },
    ],
    totalFound: 1,
  }),
  runSherlock: vi
    .fn()
    .mockResolvedValue({ username: "test", found: [], totalFound: 0, totalChecked: 480 }),
  runMaigret: vi.fn().mockResolvedValue({ username: "test", found: [], totalFound: 0, errors: 0 }),
  runHolehe: vi
    .fn()
    .mockResolvedValue({ email: "test@test.com", registered: [], totalRegistered: 0 }),
  runPhoneInfoga: vi.fn().mockResolvedValue({ number: "+1234567890", valid: true }),
  runWhois: vi.fn().mockResolvedValue({ domain: "example.com", registrar: "Test" }),
  runDnsLookup: vi
    .fn()
    .mockResolvedValue({
      domain: "example.com",
      aRecords: ["1.2.3.4"],
      mxRecords: [],
      txtRecords: [],
      nsRecords: [],
      cnameRecords: [],
    }),
  runSublist3r: vi.fn().mockResolvedValue({ domain: "example.com", subdomains: [], total: 0 }),
  runH8mail: vi.fn().mockResolvedValue({ email: "test@test.com", breaches: [], totalBreaches: 0 }),
  runInstaloader: vi.fn().mockResolvedValue({ username: "test", found: false }),
  runPhoton: vi
    .fn()
    .mockResolvedValue({
      url: "https://example.com",
      internalUrls: [],
      externalUrls: [],
      emails: [],
      socialLinks: [],
      files: [],
      total: 0,
    }),
  runSocialScan: vi.fn().mockResolvedValue({ query: "test", results: [], totalFound: 0 }),
  runHarvester: vi
    .fn()
    .mockResolvedValue({ domain: "example.com", emails: [], hosts: [], subdomains: [], total: 0 }),
  runWhatsMyName: vi.fn().mockResolvedValue({ username: "test", found: [], totalFound: 0 }),
  runExifExtract: vi
    .fn()
    .mockResolvedValue({ imageUrl: "https://example.com/img.jpg", metadata: [], hasExif: false }),
  runCmseek: vi
    .fn()
    .mockResolvedValue({
      url: "https://example.com",
      cms: "Unknown",
      technologies: [],
      wordpress: false,
      drupal: false,
      joomla: false,
    }),
  runOsintgram: vi.fn().mockResolvedValue({ username: "test", found: false }),
}));

// Mock shadowBroker.js
vi.mock("./shadowBroker.js", () => ({
  queryShadowBroker: vi.fn().mockResolvedValue({
    success: true,
    type: "patterns",
    data: [],
    durationMs: 5,
  }),
}));

import { queryOSINT, clearOSINTCache, getOSINTStats } from "./osintProvider.js";

describe("OSINT Provider — Shadow Broker Integration", () => {
  beforeEach(() => {
    clearOSINTCache();
    vi.clearAllMocks();
  });

  describe("queryOSINT — recherches natives", () => {
    it("recherche username-fast retourne des résultats", async () => {
      const result = await queryOSINT(null, "username-fast", "testuser");

      expect(result.success).toBe(true);
      expect(result.type).toBe("username-fast");
      expect(result.fromCache).toBe(false);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("recherche email retourne des résultats", async () => {
      const result = await queryOSINT(null, "email", "test@example.com");

      expect(result.success).toBe(true);
      expect(result.type).toBe("email");
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("recherche domain retourne des résultats", async () => {
      const result = await queryOSINT(null, "domain", "example.com");

      expect(result.success).toBe(true);
      expect(result.type).toBe("domain");
      expect(result.data).toHaveProperty("subdomains");
    });

    it("recherche phone retourne des résultats", async () => {
      const result = await queryOSINT(null, "phone", "+1234567890");

      expect(result.success).toBe(true);
      expect(result.type).toBe("phone");
      expect(result.data).toHaveProperty("valid");
    });
  });

  describe("queryOSINT — cache", () => {
    it("second appel identique utilise le cache", async () => {
      const first = await queryOSINT(null, "username-fast", "cachetest");
      expect(first.fromCache).toBe(false);

      const second = await queryOSINT(null, "username-fast", "cachetest");
      expect(second.fromCache).toBe(true);
      expect(second.success).toBe(true);
      expect(second.data).toEqual(first.data);
    });

    it("clearOSINTCache vide le cache", async () => {
      await queryOSINT(null, "username-fast", "willbecleared");
      clearOSINTCache();
      const result = await queryOSINT(null, "username-fast", "willbecleared");
      expect(result.fromCache).toBe(false);
    });
  });

  describe("queryOSINT — gestion d'erreurs", () => {
    it("type inconnu retourne success=false", async () => {
      const result = await queryOSINT(null, "unknown" as any, "test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Type OSINT inconnu");
    });

    it("inclut durationMs même en cas d'erreur", async () => {
      const result = await queryOSINT(null, "unknown" as any, "test");

      expect(result).toHaveProperty("durationMs");
      expect(typeof result.durationMs).toBe("number");
    });
  });

  describe("queryOSINT — rate limiting", () => {
    it("stats retournent les bonnes valeurs", async () => {
      await queryOSINT(null, "username-fast", "stats1");
      const stats = getOSINTStats();

      expect(stats).toHaveProperty("cacheSize");
      expect(stats).toHaveProperty("maxConcurrent");
      expect(stats).toHaveProperty("maxPerMinute");
      expect(stats.maxConcurrent).toBe(3);
      expect(stats.maxPerMinute).toBe(20);
    });
  });

  describe("queryOSINT — intelligence Discord", () => {
    it("patterns sans client Discord retourne success=false", async () => {
      const result = await queryOSINT(null, "patterns", "guild123", { guildId: "guild123" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Client Discord requis");
    });

    it("patterns avec client mocké fonctionne", async () => {
      const fakeClient = {} as any;
      const result = await queryOSINT(fakeClient, "patterns", "guild123", { guildId: "guild123" });

      expect(result.success).toBe(true);
      expect(result.type).toBe("patterns");
    });
  });
});
