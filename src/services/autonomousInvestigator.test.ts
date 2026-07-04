/**
 * autonomousInvestigator.test.ts — Tests du module d'investigation autonome
 *
 * Vérifie que :
 *  - shouldInvestigate déclenche sur CRITIQUE et ELEVE+5 sanctions
 *  - shouldInvestigate ne déclenche pas sur FAIBLE/MOYEN
 *  - maybeTriggerInvestigation respecte le cooldown
 *  - extractUsername extrait correctement le pseudo depuis MemberIntel
 *  - compileMarkdownReport génère un rapport structuré
 *  - generateSummary produit un résumé concis
 *  - getRecommendation propose la bonne action selon le niveau
 *  - buildInvestigationEmbed génère un embed valide
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

// Mock osintProvider
vi.mock("./osintProvider.js", () => ({
  queryOSINT: vi.fn().mockImplementation((_client, type, query) =>
    Promise.resolve({
      success: true,
      type,
      query,
      data: [{ platform: "GitHub", url: `https://github.com/${query}`, found: true }],
      durationMs: 100,
      fromCache: false,
    }),
  ),
}));

// Mock shadowBroker
vi.mock("./shadowBroker.js", () => ({
  getMemberIntel: vi.fn().mockResolvedValue({
    userId: "123",
    tag: "TestUser#0001",
    avatarUrl: "https://example.com/avatar.png",
    accountCreatedAt: new Date("2020-01-01"),
    joinedAt: new Date("2023-01-01"),
    roles: ["member"],
    activityScore: 50,
    messageCount: 100,
    sanctionCount: 5,
    riskScore: 100,
    riskLevel: "CRITIQUE",
    nameChanges: 3,
    avatarChanges: 2,
    lastActive: new Date(),
    suspiciousFlags: ["rapid_name_change", "new_account"],
    linkedAccounts: [
      {
        userId: "456",
        tag: "AltAccount#0002",
        confidence: 85,
        reasons: ["shared_avatar", "close_creation_date"],
      },
    ],
  }),
}));

// Mock alert-service
vi.mock("./alert-service.js", () => ({
  generateAlert: vi.fn().mockResolvedValue({
    id: "alert-123",
    guildId: "guild1",
    userId: "user1",
    type: "AUTONOMOUS_INVESTIGATION",
    riskScore: 100,
    riskLevel: "CRITIQUE",
    details: "Test investigation",
    status: "PENDING",
  }),
  sendAlertToChannel: vi.fn().mockResolvedValue(undefined),
  notifyOwners: vi.fn().mockResolvedValue(undefined),
  resolveAlert: vi.fn().mockResolvedValue(null),
}));

// Mock logs
vi.mock("./logs.js", () => ({
  createLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock prisma
vi.mock("../prisma.js", () => ({
  default: {
    sanction: { create: vi.fn().mockResolvedValue({}) },
    riskProfile: { updateMany: vi.fn().mockResolvedValue({}) },
  },
}));

// Mock ai
vi.mock("./ai.js", () => ({
  getOpenAIClient: vi.fn().mockReturnValue({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "{\"action\":\"WATCH\",\"confidence\":75,\"reasoning\":\"Surveillance recommandée\"}" } }],
        }),
      },
    },
  }),
}));

// Mock config
vi.mock("../config.js", () => ({
  config: {
    openRouterModel: "test-model",
    autonomousAgentMode: "autonomous",
    autonomousAgentConfidenceThreshold: 70,
  },
}));

import {
  shouldInvestigate,
  maybeTriggerInvestigation,
  clearCooldowns,
  getCooldownStatus,
  buildInvestigationEmbed,
  runInvestigation,
  extractUsername,
  compileMarkdownReport,
  generateSummary,
  getRecommendation,
} from "./autonomousInvestigator.js";
import type { RiskProfile } from "./risk-engine.js";
import type { MemberIntel } from "./shadowBroker.js";

function makeProfile(overrides: Partial<RiskProfile> = {}): RiskProfile {
  return {
    userId: "123456789",
    guildId: "guild123",
    riskScore: 100,
    riskLevel: "CRITIQUE",
    warnCount: 3,
    timeoutCount: 2,
    kickCount: 1,
    tempbanCount: 0,
    banCount: 1,
    totalSanctions: 7,
    underWatch: false,
    lastSanctionAt: new Date(),
    lastAlertAt: null,
    ...overrides,
  };
}

const fakeClient = {
  guilds: {
    cache: {
      get: () => ({
        members: {
          fetch: () => Promise.resolve({ id: "123" }),
        },
      }),
    },
  },
} as any;

describe("Autonomous Investigator", () => {
  beforeEach(() => {
    clearCooldowns();
    vi.clearAllMocks();
  });

  describe("shouldInvestigate", () => {
    it("déclenche sur CRITIQUE", () => {
      expect(shouldInvestigate(makeProfile({ riskLevel: "CRITIQUE", riskScore: 100 }))).toBe(true);
    });

    it("déclenche sur ELEVE avec 5+ sanctions", () => {
      expect(
        shouldInvestigate(makeProfile({ riskLevel: "ELEVE", riskScore: 60, totalSanctions: 5 })),
      ).toBe(true);
    });

    it("ne déclenche pas sur ELEVE avec moins de 5 sanctions", () => {
      expect(
        shouldInvestigate(makeProfile({ riskLevel: "ELEVE", riskScore: 60, totalSanctions: 3 })),
      ).toBe(false);
    });

    it("ne déclenche pas sur MOYEN", () => {
      expect(
        shouldInvestigate(makeProfile({ riskLevel: "MOYEN", riskScore: 30, totalSanctions: 2 })),
      ).toBe(false);
    });

    it("ne déclenche pas sur FAIBLE", () => {
      expect(
        shouldInvestigate(makeProfile({ riskLevel: "FAIBLE", riskScore: 10, totalSanctions: 0 })),
      ).toBe(false);
    });
  });

  describe("maybeTriggerInvestigation — cooldown", () => {
    it("retourne null pour un profil non critique", async () => {
      const result = await maybeTriggerInvestigation(
        fakeClient,
        makeProfile({ riskLevel: "FAIBLE", riskScore: 10 }),
      );
      expect(result).toBeNull();
    });

    it("déclenche une investigation pour un profil critique", async () => {
      const result = await maybeTriggerInvestigation(
        fakeClient,
        makeProfile({ riskLevel: "CRITIQUE" }),
      );
      expect(result).not.toBeNull();
      expect(result?.riskLevel).toBe("CRITIQUE");
    });

    it("respecte le cooldown — second appel rejeté", async () => {
      const first = await maybeTriggerInvestigation(
        fakeClient,
        makeProfile({ riskLevel: "CRITIQUE" }),
      );
      expect(first).not.toBeNull();

      const second = await maybeTriggerInvestigation(
        fakeClient,
        makeProfile({ riskLevel: "CRITIQUE" }),
      );
      expect(second).toBeNull();
    });

    it("getCooldownStatus retourne true après investigation", async () => {
      await maybeTriggerInvestigation(fakeClient, makeProfile({ riskLevel: "CRITIQUE" }));
      expect(getCooldownStatus("123456789", "guild123")).toBe(true);
    });
  });

  describe("runInvestigation", () => {
    it("génère un rapport complet avec OSINT results", async () => {
      const report = await runInvestigation(fakeClient, makeProfile({ riskLevel: "CRITIQUE" }));

      expect(report.reportId).toMatch(/^INV-\d+-/);
      expect(report.riskLevel).toBe("CRITIQUE");
      expect(report.osintResults.length).toBeGreaterThan(0);
      expect(report.markdownReport).toContain("# Rapport d'Investigation Autonome");
      expect(report.markdownReport).toContain("## Intelligence Discord");
      expect(report.markdownReport).toContain("## Résultats OSINT");
      expect(report.markdownReport).toContain("## Conclusion");
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("inclut le triggerReason dans le rapport", async () => {
      const report = await runInvestigation(
        fakeClient,
        makeProfile({ riskLevel: "CRITIQUE", riskScore: 150 }),
      );
      expect(report.triggerReason).toContain("150");
    });
  });

  describe("extractUsername", () => {
    it("extrait le pseudo depuis un tag Discord", () => {
      const intel = { tag: "TestUser#0001" } as MemberIntel;
      expect(extractUsername(intel, "123")).toBe("TestUser");
    });

    it("retourne null si pas d'intel", () => {
      expect(extractUsername(null, "123")).toBeNull();
    });

    it("retourne null si tag vide", () => {
      const intel = { tag: "" } as MemberIntel;
      expect(extractUsername(intel, "123")).toBeNull();
    });
  });

  describe("compileMarkdownReport", () => {
    it("génère un rapport avec toutes les sections", () => {
      const profile = makeProfile();
      const intel = {
        tag: "TestUser#0001",
        activityScore: 50,
        suspiciousFlags: ["flag1"],
        linkedAccounts: [{ tag: "Alt#0002", confidence: 80, reasons: ["shared_avatar"] }],
        nameChanges: 3,
        avatarChanges: 2,
      } as MemberIntel;

      const report = compileMarkdownReport("INV-TEST", profile, intel, [], "Test trigger");

      expect(report).toContain("# Rapport d'Investigation Autonome — INV-TEST");
      expect(report).toContain("## Intelligence Discord");
      expect(report).toContain("TestUser#0001");
      expect(report).toContain("flag1");
      expect(report).toContain("Alt#0002");
      expect(report).toContain("## Conclusion");
    });

    it("gère l'absence de Discord Intel", () => {
      const report = compileMarkdownReport("INV-TEST", makeProfile(), null, [], "Test");
      expect(report).toContain("Données Discord indisponibles");
    });
  });

  describe("generateSummary", () => {
    it("produit un résumé concis", () => {
      const profile = makeProfile({ riskScore: 120, riskLevel: "CRITIQUE" });
      const osintResults = [
        {
          success: true,
          type: "sherlock",
          query: "test",
          data: [],
          durationMs: 100,
          fromCache: false,
        },
        {
          success: false,
          type: "maigret",
          query: "test",
          data: null,
          durationMs: 50,
          fromCache: false,
          error: "timeout",
        },
      ] as any;

      const intel = {
        linkedAccounts: [{ tag: "alt", confidence: 80, reasons: [] }],
        suspiciousFlags: ["flag1"],
      } as unknown as MemberIntel;

      const summary = generateSummary(profile, osintResults, intel);
      expect(summary).toContain("120");
      expect(summary).toContain("CRITIQUE");
      expect(summary).toContain("1/2");
      expect(summary).toContain("1 comptes liés");
    });
  });

  describe("getRecommendation", () => {
    it("recommande BAN pour CRITIQUE", () => {
      const rec = getRecommendation(makeProfile({ riskLevel: "CRITIQUE" }), [], null);
      expect(rec).toContain("BAN");
    });

    it("recommande BAN avec réseau pour CRITIQUE + comptes liés", () => {
      const intel = {
        linkedAccounts: [
          { tag: "a", confidence: 80, reasons: [] },
          { tag: "b", confidence: 70, reasons: [] },
          { tag: "c", confidence: 60, reasons: [] },
        ],
      } as unknown as MemberIntel;
      const rec = getRecommendation(makeProfile({ riskLevel: "CRITIQUE" }), [], intel);
      expect(rec).toContain("réseau");
    });

    it("recommande timeout pour ELEVE + 5 sanctions", () => {
      const rec = getRecommendation(
        makeProfile({ riskLevel: "ELEVE", totalSanctions: 5 }),
        [],
        null,
      );
      expect(rec).toContain("Timeout");
    });
  });

  describe("buildInvestigationEmbed", () => {
    it("génère un embed avec les bons champs", () => {
      const report = {
        reportId: "INV-TEST-1234",
        userId: "123",
        guildId: "guild1",
        triggeredAt: new Date(),
        triggerReason: "Score critique (100)",
        riskScore: 100,
        riskLevel: "CRITIQUE",
        discordIntel: null,
        osintResults: [
          {
            success: true,
            type: "sherlock",
            query: "test",
            data: [],
            durationMs: 100,
            fromCache: false,
          },
        ],
        summary: "Test summary",
        markdownReport: "",
        durationMs: 500,
        aiDecision: null,
      } as any;

      const embed = buildInvestigationEmbed(report);
      expect(embed).toBeDefined();
    });
  });
});
