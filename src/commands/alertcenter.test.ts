import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockPrisma, mockRequireAdmin, mockAlertService, mockRiskEngine, mockLogs } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockPrisma: {
    guildConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    riskProfile: {
      count: vi.fn(),
    },
  },
  mockRequireAdmin: vi.fn(),
  mockAlertService: {
    getPendingAlerts: vi.fn(),
    getAlertHistory: vi.fn(),
    getAlertsByUser: vi.fn(),
  },
  mockRiskEngine: {
    getRiskReport: vi.fn(),
    getAllRiskyUsers: vi.fn(),
    resetRiskProfile: vi.fn(),
  },
  mockLogs: {
    createLog: vi.fn(),
  },
}));

vi.mock("../utils/logger", () => ({ default: mockLogger }));
vi.mock("../prisma", () => ({ default: mockPrisma }));
vi.mock("../services/permissions", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("../services/alert-service", () => mockAlertService);
vi.mock("../services/risk-engine", () => mockRiskEngine);
vi.mock("../services/logs", () => ({ createLog: mockLogs.createLog }));

import { handleCommand } from "./alertcenter";
import type { ChatInputCommandInteraction, User } from "discord.js";

// ── Helpers ────────────────────────────────────────────────────

interface MIOptions {
  commandName?: string;
  subcommand?: string;
  guildId?: string;
  userId?: string;
  userTag?: string;
  targetUser?: { id: string; tag: string };
  channel?: { id: string; name: string };
  score?: number;
  actif?: boolean;
  niveau?: string | null;
}

function mi(opts: MIOptions = {}): ChatInputCommandInteraction {
  return {
    commandName: opts.commandName ?? "alertcenter",
    guildId: opts.guildId ?? "guild-123",
    user: {
      id: opts.userId ?? "mod-456",
      tag: opts.userTag ?? "Modo#1234",
    } as User,
    options: {
      getSubcommand: vi.fn(() => opts.subcommand ?? "pending"),
      getUser: vi.fn((name: string, required?: boolean) => {
        if (name === "cible") return opts.targetUser ?? { id: "user-789", tag: "BadUser#5678" };
        return null;
      }),
      getChannel: vi.fn((name: string, required?: boolean) => {
        if (name === "salon") return opts.channel ?? { id: "ch-111", name: "alertes" };
        return null;
      }),
      getInteger: vi.fn((name: string, required?: boolean) => {
        if (name === "score") return opts.score ?? 50;
        return null;
      }),
      getBoolean: vi.fn((name: string, required?: boolean) => {
        if (name === "actif") return opts.actif ?? true;
        return null;
      }),
      getString: vi.fn((name: string) => {
        if (name === "niveau") return opts.niveau ?? null;
        return null;
      }),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

function getEmbeds(interaction: any) {
  const call = interaction.editReply.mock.calls[0]?.[0];
  return call?.embeds ?? [];
}

function getFirstEmbed(interaction: any) {
  return getEmbeds(interaction)[0]?.data ?? null;
}

// ── Sample data factories ──────────────────────────────────────

function sampleAlert(overrides: Record<string, any> = {}) {
  return {
    userId: "user-789",
    riskLevel: "ÉLEVÉ",
    riskScore: 65,
    createdAt: new Date("2025-06-01T12:00:00Z"),
    details: "Spam détecté",
    ...overrides,
  };
}

function sampleRiskProfile(overrides: Record<string, any> = {}) {
  return {
    riskLevel: "ÉLEVÉ",
    riskScore: 65,
    warnCount: 3,
    timeoutCount: 1,
    kickCount: 0,
    tempbanCount: 0,
    banCount: 0,
    totalSanctions: 4,
    underWatch: true,
    ...overrides,
  };
}

function sampleSanction(overrides: Record<string, any> = {}) {
  return {
    type: "WARN",
    reason: "Comportement inapproprié dans le chat général",
    createdAt: new Date("2025-05-28T10:00:00Z"),
    ...overrides,
  };
}

function sampleRiskyUser(overrides: Record<string, any> = {}) {
  return {
    userId: "user-789",
    riskLevel: "ÉLEVÉ",
    riskScore: 65,
    warnCount: 3,
    totalSanctions: 4,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════

describe("handleCommand – alertcenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(true);
    mockAlertService.getPendingAlerts.mockResolvedValue([]);
    mockAlertService.getAlertHistory.mockResolvedValue([]);
    mockAlertService.getAlertsByUser.mockResolvedValue([]);
    mockRiskEngine.getRiskReport.mockResolvedValue({
      profile: sampleRiskProfile(),
      recentSanctions: [],
    });
    mockRiskEngine.getAllRiskyUsers.mockResolvedValue([]);
    mockRiskEngine.resetRiskProfile.mockResolvedValue(undefined);
    mockPrisma.guildConfig.findUnique.mockResolvedValue(null);
    mockPrisma.guildConfig.upsert.mockResolvedValue({});
    mockPrisma.riskProfile.count.mockResolvedValue(0);
    mockLogs.createLog.mockResolvedValue(undefined);
  });

  // ── Admin check ──────────────────────────────────────────

  describe("admin check", () => {
    it("rejette l'accès si requireAdmin retourne false", async () => {
      mockRequireAdmin.mockResolvedValue(false);

      const interaction = mi({ commandName: "alertcenter", subcommand: "pending" });
      const result = await handleCommand(interaction);

      expect(result).toBe(false);
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it("rejette l'accès pour /riskscore si non admin", async () => {
      mockRequireAdmin.mockResolvedValue(false);

      const interaction = mi({ commandName: "riskscore" });
      const result = await handleCommand(interaction);

      expect(result).toBe(false);
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it("rejette l'accès pour /riskyusers si non admin", async () => {
      mockRequireAdmin.mockResolvedValue(false);

      const interaction = mi({ commandName: "riskyusers" });
      const result = await handleCommand(interaction);

      expect(result).toBe(false);
    });

    it("rejette l'accès pour /alertconfig si non admin", async () => {
      mockRequireAdmin.mockResolvedValue(false);

      const interaction = mi({ commandName: "alertconfig", subcommand: "view" });
      const result = await handleCommand(interaction);

      expect(result).toBe(false);
    });
  });

  // ── /alertcenter pending ─────────────────────────────────

  describe("/alertcenter pending", () => {
    it("affiche 'aucune alerte' quand la liste est vide", async () => {
      const interaction = mi({ commandName: "alertcenter", subcommand: "pending" });

      await handleCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Aucune alerte en attente");
      expect(embed.color).toBe(0x53fc18);
    });

    it("affiche les alertes en attente", async () => {
      mockAlertService.getPendingAlerts.mockResolvedValue([
        sampleAlert({ riskLevel: "MOYEN", riskScore: 40 }),
        sampleAlert({ userId: "user-222", riskLevel: "CRITIQUE", riskScore: 90 }),
      ]);

      const interaction = mi({ commandName: "alertcenter", subcommand: "pending" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("2 alerte(s) en attente");
      expect(embed.color).toBe(0xffaa00);
      expect(embed.fields).toHaveLength(2);
      expect(embed.fields![0].name).toContain("user-789");
      expect(embed.fields![0].name).toContain("MOYEN");
      expect(embed.fields![1].name).toContain("CRITIQUE");
    });

    it("limite l'affichage à 10 alertes", async () => {
      const manyAlerts = Array.from({ length: 15 }, (_, i) =>
        sampleAlert({ userId: `user-${i}`, riskScore: 30 + i })
      );
      mockAlertService.getPendingAlerts.mockResolvedValue(manyAlerts);

      const interaction = mi({ commandName: "alertcenter", subcommand: "pending" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("15 alerte(s)");
      expect(embed.fields).toHaveLength(10);
    });

    it("affiche une erreur si getPendingAlerts échoue", async () => {
      mockAlertService.getPendingAlerts.mockRejectedValue(new Error("DB down"));

      const interaction = mi({ commandName: "alertcenter", subcommand: "pending" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de récupérer les alertes");
      expect(embed.color).toBe(0xff3344);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // ── /alertcenter history ─────────────────────────────────

  describe("/alertcenter history", () => {
    it("affiche 'aucune alerte' quand l'historique est vide", async () => {
      const interaction = mi({ commandName: "alertcenter", subcommand: "history" });

      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Aucune alerte dans l'historique");
      expect(embed.color).toBe(0x53fc18);
    });

    it("affiche l'historique avec stats PENDING/RESOLVED", async () => {
      mockAlertService.getAlertHistory.mockResolvedValue([
        sampleAlert({ status: "RESOLVED", action: "WARN" }),
        sampleAlert({ userId: "user-333", status: "PENDING", action: null }),
        sampleAlert({ userId: "user-444", status: "RESOLVED", action: "KICK" }),
      ]);

      const interaction = mi({ commandName: "alertcenter", subcommand: "history" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("3");
      expect(embed.description).toContain("1"); // pending count
      expect(embed.description).toContain("2"); // resolved count
      expect(embed.color).toBe(0x3498db);
      expect(embed.fields).toHaveLength(3);
    });

    it("appelle getAlertHistory avec guildId et limite 25", async () => {
      const interaction = mi({ commandName: "alertcenter", subcommand: "history", guildId: "guild-xyz" });
      await handleCommand(interaction);

      expect(mockAlertService.getAlertHistory).toHaveBeenCalledWith("guild-xyz", 25);
    });

    it("affiche une erreur si getAlertHistory échoue", async () => {
      mockAlertService.getAlertHistory.mockRejectedValue(new Error("DB error"));

      const interaction = mi({ commandName: "alertcenter", subcommand: "history" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de récupérer l'historique");
      expect(embed.color).toBe(0xff3344);
    });
  });

  // ── /alertcenter user ────────────────────────────────────

  describe("/alertcenter user", () => {
    it("affiche 'aucune alerte' pour un utilisateur sans alertes", async () => {
      const interaction = mi({ commandName: "alertcenter", subcommand: "user" });

      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Aucune alerte");
      expect(embed.description).toContain("BadUser#5678");
      expect(embed.color).toBe(0x53fc18);
    });

    it("récupère l'utilisateur cible via getSubcommand + getUser", async () => {
      const interaction = mi({
        commandName: "alertcenter",
        subcommand: "user",
        targetUser: { id: "specific-222", tag: "Trolleur#9999" },
      });
      await handleCommand(interaction);

      expect(interaction.options.getUser).toHaveBeenCalledWith("cible", true);
      expect(mockAlertService.getAlertsByUser).toHaveBeenCalledWith("specific-222", "guild-123");
    });

    it("affiche les alertes d'un utilisateur", async () => {
      mockAlertService.getAlertsByUser.mockResolvedValue([
        sampleAlert({ riskLevel: "MOYEN", riskScore: 30, status: "RESOLVED" }),
        sampleAlert({ riskLevel: "ÉLEVÉ", riskScore: 70, status: "PENDING", details: "Raid suspect" }),
      ]);

      const interaction = mi({ commandName: "alertcenter", subcommand: "user" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.title).toContain("BadUser#5678");
      expect(embed.description).toContain("2");
      expect(embed.fields).toHaveLength(2);
      expect(embed.fields![0].name).toContain("MOYEN");
      expect(embed.fields![0].name).toContain("RESOLVED");
    });

    it("affiche une erreur si getAlertsByUser échoue", async () => {
      mockAlertService.getAlertsByUser.mockRejectedValue(new Error("DB error"));

      const interaction = mi({ commandName: "alertcenter", subcommand: "user" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de récupérer les alertes");
      expect(embed.color).toBe(0xff3344);
    });
  });

  // ── /riskscore ───────────────────────────────────────────

  describe("/riskscore", () => {
    it("affiche le profil de risque complet", async () => {
      mockRiskEngine.getRiskReport.mockResolvedValue({
        profile: sampleRiskProfile({ riskLevel: "CRITIQUE", riskScore: 85, warnCount: 5 }),
        recentSanctions: [sampleSanction(), sampleSanction({ type: "TIMEOUT", reason: "Spam vocal" })],
      });

      const interaction = mi({ commandName: "riskscore", targetUser: { id: "u-999", tag: "Troll#0001" } });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.title).toContain("Troll#0001");
      expect(embed.description).toContain("CRITIQUE");
      expect(embed.description).toContain("85");
      expect(embed.description).toContain("5"); // warnCount
      expect(embed.description).toContain("Sous surveillance");
      expect(embed.color).toBe(0xff3344); // CRITIQUE color
      expect(mockRiskEngine.getRiskReport).toHaveBeenCalledWith("u-999", "guild-123");
    });

    it("affiche 'Aucune sanction récente' si pas de sanctions", async () => {
      mockRiskEngine.getRiskReport.mockResolvedValue({
        profile: sampleRiskProfile({ riskLevel: "MOYEN", riskScore: 35 }),
        recentSanctions: [],
      });

      const interaction = mi({ commandName: "riskscore", targetUser: { id: "u-111", tag: "Newbie#0001" } });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Aucune sanction récente");
      expect(embed.color).toBe(0xffaa00); // MOYEN color
    });

    it("affiche le profil FAIBLE en vert", async () => {
      mockRiskEngine.getRiskReport.mockResolvedValue({
        profile: sampleRiskProfile({ riskLevel: "FAIBLE", riskScore: 5 }),
        recentSanctions: [],
      });

      const interaction = mi({ commandName: "riskscore", targetUser: { id: "u-000", tag: "Gentil#0001" } });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.color).toBe(0x53fc18);
    });

    it("affiche une erreur si getRiskReport échoue", async () => {
      mockRiskEngine.getRiskReport.mockRejectedValue(new Error("Engine failure"));

      const interaction = mi({ commandName: "riskscore", targetUser: { id: "u-err", tag: "Error#0001" } });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de calculer le score de risque");
      expect(embed.color).toBe(0xff3344);
    });

    it("limite les sanctions affichées à 5", async () => {
      const manySanctions = Array.from({ length: 10 }, (_, i) =>
        sampleSanction({ type: "WARN", reason: `Infraction #${i + 1}` })
      );
      mockRiskEngine.getRiskReport.mockResolvedValue({
        profile: sampleRiskProfile({ riskLevel: "ÉLEVÉ" }),
        recentSanctions: manySanctions,
      });

      const interaction = mi({ commandName: "riskscore", targetUser: { id: "u-bad", tag: "Recidive#9999" } });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      // Only count sanctions (after "Dernières Sanctions" header), not the stats bullets
      const parts = embed.description.split("### Dernières Sanctions");
      const sanctionsSection = parts[1] || "";
      const sanctionCount = (sanctionsSection.match(/• \*\*/g) || []).length;
      expect(sanctionCount).toBe(5); // exactly 5 sanctions shown, 5 hidden
    });
  });

  // ── /riskyusers ──────────────────────────────────────────

  describe("/riskyusers", () => {
    it("affiche 'aucun utilisateur' quand la liste est vide", async () => {
      const interaction = mi({ commandName: "riskyusers" });

      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Aucun utilisateur");
      expect(embed.description).toContain("MOYEN"); // default level
      expect(embed.color).toBe(0x53fc18);
    });

    it("utilise le niveau par défaut MOYEN si non spécifié", async () => {
      const interaction = mi({ commandName: "riskyusers", niveau: null });
      await handleCommand(interaction);

      expect(mockRiskEngine.getAllRiskyUsers).toHaveBeenCalledWith("guild-123", "MOYEN");
    });

    it("passe le niveau spécifié à getAllRiskyUsers", async () => {
      const interaction = mi({ commandName: "riskyusers", niveau: "CRITIQUE" });
      await handleCommand(interaction);

      expect(mockRiskEngine.getAllRiskyUsers).toHaveBeenCalledWith("guild-123", "CRITIQUE");
    });

    it("affiche les utilisateurs à risque", async () => {
      mockRiskEngine.getAllRiskyUsers.mockResolvedValue([
        sampleRiskyUser({ riskLevel: "ÉLEVÉ", riskScore: 55 }),
        sampleRiskyUser({ userId: "user-222", riskLevel: "CRITIQUE", riskScore: 95, warnCount: 8 }),
        sampleRiskyUser({ userId: "user-333", riskLevel: "MOYEN", riskScore: 35, totalSanctions: 1 }),
      ]);

      const interaction = mi({ commandName: "riskyusers", niveau: "MOYEN" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("3 utilisateur(s)");
      expect(embed.color).toBe(0xff6600);
      expect(embed.fields).toHaveLength(3);
      expect(embed.fields![0].value).toContain("55"); // ÉLEVÉ user
      expect(embed.fields![1].value).toContain("95"); // CRITIQUE user shows correct score
      expect(embed.fields![2].value).toContain("35"); // MOYEN user
    });

    it("limite l'affichage à 15 utilisateurs", async () => {
      const many = Array.from({ length: 20 }, (_, i) =>
        sampleRiskyUser({ userId: `user-${i}`, riskScore: 30 + i })
      );
      mockRiskEngine.getAllRiskyUsers.mockResolvedValue(many);

      const interaction = mi({ commandName: "riskyusers" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.fields).toHaveLength(15);
    });

    it("affiche une erreur si getAllRiskyUsers échoue", async () => {
      mockRiskEngine.getAllRiskyUsers.mockRejectedValue(new Error("DB error"));

      const interaction = mi({ commandName: "riskyusers" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de lister les utilisateurs");
      expect(embed.color).toBe(0xff3344);
    });
  });

  // ── /alertconfig channel ─────────────────────────────────

  describe("/alertconfig channel", () => {
    it("configure le salon d'alertes et crée un log", async () => {
      const interaction = mi({
        commandName: "alertconfig",
        subcommand: "channel",
        channel: { id: "ch-999", name: "mod-logs" },
      });
      await handleCommand(interaction);

      expect(interaction.options.getChannel).toHaveBeenCalledWith("salon", true);
      expect(mockPrisma.guildConfig.upsert).toHaveBeenCalledWith({
        where: { guildId: "guild-123" },
        create: { guildId: "guild-123", logChannelId: "ch-999" },
        update: { logChannelId: "ch-999" },
      });
      expect(mockLogs.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CONFIG",
          action: "Salon d'alertes défini: #mod-logs",
          moderator: "mod-456",
          details: "Channel ID: ch-999",
        })
      );

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Salon d'alertes défini");
      expect(embed.color).toBe(0x53fc18);
    });

    it("affiche une erreur si upsert échoue", async () => {
      mockPrisma.guildConfig.upsert.mockRejectedValue(new Error("DB error"));

      const interaction = mi({ commandName: "alertconfig", subcommand: "channel" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de configurer le salon");
      expect(embed.color).toBe(0xff3344);
    });
  });

  // ── /alertconfig threshold ───────────────────────────────

  describe("/alertconfig threshold", () => {
    it("configure le seuil et crée un log", async () => {
      const interaction = mi({ commandName: "alertconfig", subcommand: "threshold", score: 75 });
      await handleCommand(interaction);

      expect(interaction.options.getInteger).toHaveBeenCalledWith("score", true);
      expect(mockLogs.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CONFIG",
          action: "Seuil d'alerte modifié: 75",
          moderator: "mod-456",
        })
      );

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("75");
      expect(embed.color).toBe(0x53fc18);
    });

    it("affiche une erreur si createLog échoue", async () => {
      mockLogs.createLog.mockRejectedValue(new Error("DB error"));

      const interaction = mi({ commandName: "alertconfig", subcommand: "threshold", score: 60 });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de configurer le seuil");
      expect(embed.color).toBe(0xff3344);
    });
  });

  // ── /alertconfig owner_notify ────────────────────────────

  describe("/alertconfig owner_notify", () => {
    it("active les notifications propriétaires", async () => {
      const interaction = mi({ commandName: "alertconfig", subcommand: "owner_notify", actif: true });
      await handleCommand(interaction);

      expect(interaction.options.getBoolean).toHaveBeenCalledWith("actif", true);
      expect(mockLogs.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "Notifications propriétaires: ON",
        })
      );

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("activées");
      expect(embed.color).toBe(0x53fc18);
    });

    it("désactive les notifications propriétaires", async () => {
      const interaction = mi({ commandName: "alertconfig", subcommand: "owner_notify", actif: false });
      await handleCommand(interaction);

      expect(mockLogs.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "Notifications propriétaires: OFF",
        })
      );

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("désactivées");
    });

    it("affiche une erreur si createLog échoue", async () => {
      mockLogs.createLog.mockRejectedValue(new Error("DB error"));

      const interaction = mi({ commandName: "alertconfig", subcommand: "owner_notify", actif: true });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de configurer les notifications");
      expect(embed.color).toBe(0xff3344);
    });
  });

  // ── /alertconfig reset ───────────────────────────────────

  describe("/alertconfig reset", () => {
    it("réinitialise le profil de risque et crée un log", async () => {
      const interaction = mi({
        commandName: "alertconfig",
        subcommand: "reset",
        targetUser: { id: "u-reset", tag: "ResetMe#0001" },
      });
      await handleCommand(interaction);

      expect(interaction.options.getUser).toHaveBeenCalledWith("cible", true);
      expect(mockRiskEngine.resetRiskProfile).toHaveBeenCalledWith("u-reset", "guild-123");
      expect(mockLogs.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CONFIG",
          action: "Profil de risque réinitialisé: ResetMe#0001",
          moderator: "mod-456",
          userId: "u-reset",
        })
      );

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("ResetMe#0001");
      expect(embed.description).toContain("réinitialisé");
      expect(embed.color).toBe(0x53fc18);
    });

    it("affiche une erreur si resetRiskProfile échoue", async () => {
      mockRiskEngine.resetRiskProfile.mockRejectedValue(new Error("Not found"));

      const interaction = mi({ commandName: "alertconfig", subcommand: "reset" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible de réinitialiser le profil");
      expect(embed.color).toBe(0xff3344);
    });
  });

  // ── /alertconfig view ────────────────────────────────────

  describe("/alertconfig view", () => {
    it("affiche la configuration avec toutes les stats à zéro", async () => {
      mockPrisma.guildConfig.findUnique.mockResolvedValue({
        guildId: "guild-123",
        logChannelId: "ch-111",
        antiRaidEnabled: true,
        antiPhishing: false,
      });

      const interaction = mi({ commandName: "alertconfig", subcommand: "view" });
      await handleCommand(interaction);

      expect(mockPrisma.guildConfig.findUnique).toHaveBeenCalledWith({
        where: { guildId: "guild-123" },
      });
      expect(mockAlertService.getPendingAlerts).toHaveBeenCalledWith("guild-123");
      expect(mockPrisma.riskProfile.count).toHaveBeenCalledWith({
        where: {
          guildId: "guild-123",
          riskLevel: { in: ["ÉLEVÉ", "CRITIQUE"] },
        },
      });

      const embed = getFirstEmbed(interaction);
      expect(embed.fields).toHaveLength(5);
      expect(embed.fields![0].value).toContain("ch-111");
      expect(embed.fields![1].value).toBe("0");
      expect(embed.fields![2].value).toBe("0");
      expect(embed.fields![3].value).toContain("Activé");
      expect(embed.fields![4].value).toContain("Désactivé");
      expect(embed.color).toBe(0x3498db);
    });

    it("affiche 'Non configuré' si pas de config", async () => {
      const interaction = mi({ commandName: "alertconfig", subcommand: "view" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.fields![0].value).toBe("Non configuré");
      expect(embed.fields![3].value).toContain("Désactivé"); // default false
      expect(embed.fields![4].value).toContain("Désactivé"); // default false
    });

    it("affiche les compteurs corrects pour alertes et utilisateurs à risque", async () => {
      mockPrisma.guildConfig.findUnique.mockResolvedValue({
        guildId: "guild-123",
        logChannelId: null,
        antiRaidEnabled: true,
        antiPhishing: true,
      });
      mockAlertService.getPendingAlerts.mockResolvedValue([
        sampleAlert(),
        sampleAlert({ userId: "u2" }),
        sampleAlert({ userId: "u3" }),
      ]);
      mockPrisma.riskProfile.count.mockResolvedValue(7);

      const interaction = mi({ commandName: "alertconfig", subcommand: "view" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.fields![1].value).toBe("3"); // pending alerts
      expect(embed.fields![2].value).toBe("7"); // risky users
      expect(embed.fields![3].value).toContain("Activé");
      expect(embed.fields![4].value).toContain("Activé");
    });

    it("affiche une erreur si la récupération échoue", async () => {
      mockPrisma.guildConfig.findUnique.mockRejectedValue(new Error("DB error"));

      const interaction = mi({ commandName: "alertconfig", subcommand: "view" });
      await handleCommand(interaction);

      const embed = getFirstEmbed(interaction);
      expect(embed.description).toContain("Impossible d'afficher la configuration");
      expect(embed.color).toBe(0xff3344);
    });
  });

  // ── Unknown command ──────────────────────────────────────

  describe("commande inconnue", () => {
    it("retourne false pour une commande non reconnue", async () => {
      const interaction = mi({ commandName: "unknown_cmd" } as any);
      const result = await handleCommand(interaction);

      expect(result).toBe(false);
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });
  });
});
