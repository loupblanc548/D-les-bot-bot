import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (before any imports) ─────────────────────────────────────
const { mockPrisma, mockConfig, mockCreateLog } = vi.hoisted(() => ({
  mockPrisma: {
    guildConfig: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  mockConfig: { config: { ownerId: "owner1", adminRoles: [], modRoles: [] } },
  mockCreateLog: vi.fn(),
}));
vi.mock("../prisma", () => ({ default: mockPrisma }));
vi.mock("../config", () => mockConfig);
vi.mock("../services/logs", () => ({ createLog: mockCreateLog }));

vi.mock("../utils/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { handleCommand } from "./security";
import { Client } from "discord.js";
import logger from "../utils/logger";

// ── Mock interaction builder ────────────────────────────────────────────────
function mi(o: any = {}) {
  const interaction = {
    commandName: o.commandName ?? "antiraid",
    options: {
      getString: vi.fn((name: string) => {
        if (name === "action") return o.action ?? "on";
        return null;
      }),
      getInteger: vi.fn((name: string) => {
        if (name === "seuil_heures") return o.seuilHeures ?? null;
        return null;
      }),
    },
    user: o.user ?? {
      id: "u1",
      tag: "Test#1234",
      username: "Test",
      displayName: "Test",
    },
    guildId: o.guildId !== undefined ? o.guildId : "g1",
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
  } as any;
  return interaction;
}

const mockClient = {} as Client;

// ── Tests ───────────────────────────────────────────────────────────────────

describe("handleAntiraid (via handleCommand)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // ── guildId null ───────────────────────────────────────────────────────
  describe("guildId null", () => {
    it("repond avec erreur si hors serveur (guildId = null)", async () => {
      const interaction = mi({ guildId: null });
      await handleCommand(interaction, mockClient);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining("serveur"),
      });
      expect(mockPrisma.guildConfig.upsert).not.toHaveBeenCalled();
    });
  });

  // ── Action "on" ────────────────────────────────────────────────────────
  describe('action "on"', () => {
    it("active avec seuil par defaut (24h)", async () => {
      mockPrisma.guildConfig.upsert.mockResolvedValue({});
      const interaction = mi({ action: "on" });
      await handleCommand(interaction, mockClient);

      expect(mockPrisma.guildConfig.upsert).toHaveBeenCalledWith({
        where: { guildId: "g1" },
        update: { antiRaidEnabled: true, antiRaidSeuilHeures: 24 },
        create: { guildId: "g1", antiRaidEnabled: true, antiRaidSeuilHeures: 24 },
      });
      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it("active avec seuil personnalise (12h)", async () => {
      mockPrisma.guildConfig.upsert.mockResolvedValue({});
      const interaction = mi({ action: "on", seuilHeures: 12 });
      await handleCommand(interaction, mockClient);

      expect(mockPrisma.guildConfig.upsert).toHaveBeenCalledWith({
        where: { guildId: "g1" },
        update: { antiRaidEnabled: true, antiRaidSeuilHeures: 12 },
        create: { guildId: "g1", antiRaidEnabled: true, antiRaidSeuilHeures: 12 },
      });
    });

    it("envoie un embed de confirmation", async () => {
      mockPrisma.guildConfig.upsert.mockResolvedValue({});
      const interaction = mi({ action: "on" });
      await handleCommand(interaction, mockClient);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      );
    });
  });

  // ── Action "off" ───────────────────────────────────────────────────────
  describe('action "off"', () => {
    it("desactive l'anti-raid", async () => {
      mockPrisma.guildConfig.upsert.mockResolvedValue({});
      await handleCommand(mi({ action: "off" }), mockClient);

      expect(mockPrisma.guildConfig.upsert).toHaveBeenCalledWith({
        where: { guildId: "g1" },
        update: { antiRaidEnabled: false },
        create: { guildId: "g1", antiRaidEnabled: false },
      });
    });

    it("envoie un embed de confirmation", async () => {
      mockPrisma.guildConfig.upsert.mockResolvedValue({});
      const interaction = mi({ action: "off" });
      await handleCommand(interaction, mockClient);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      );
    });
  });

  // ── Action "status" ────────────────────────────────────────────────────
  describe('action "status"', () => {
    it("affiche INACTIF si la config n'existe pas", async () => {
      mockPrisma.guildConfig.findUnique.mockResolvedValue(null);
      const interaction = mi({ action: "status" });
      await handleCommand(interaction, mockClient);

      expect(mockPrisma.guildConfig.findUnique).toHaveBeenCalledWith({
        where: { guildId: "g1" },
      });
      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.description).toBe("**INACTIF**");
    });

    it("affiche ACTIF si active", async () => {
      mockPrisma.guildConfig.findUnique.mockResolvedValue({
        antiRaidEnabled: true,
        antiRaidSeuilHeures: 48,
      });
      const interaction = mi({ action: "status" });
      await handleCommand(interaction, mockClient);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.description).toContain("**ACTIF**");
      expect(embed.data.description).toContain("48h");
    });

    it("affiche INACTIF si antiRaidEnabled est false", async () => {
      mockPrisma.guildConfig.findUnique.mockResolvedValue({
        antiRaidEnabled: false,
        antiRaidSeuilHeures: 24,
      });
      const interaction = mi({ action: "status" });
      await handleCommand(interaction, mockClient);

      const embed = interaction.editReply.mock.calls[0][0].embeds[0];
      expect(embed.data.description).toBe("**INACTIF**");
    });
  });

  // ── Action inconnue ────────────────────────────────────────────────────
  describe("action inconnue", () => {
    it("ne fait rien et n'appelle pas Prisma", async () => {
      const interaction = mi({ action: "foo" });
      await handleCommand(interaction, mockClient);

      expect(mockPrisma.guildConfig.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.guildConfig.findUnique).not.toHaveBeenCalled();
      // deferReply est quand meme appele (premiere ligne)
      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });
  });

  // ── Erreur Prisma ─────────────────────────────────────────────────────
  describe("erreurs", () => {
    it("capture erreur Prisma sur upsert", async () => {
      mockPrisma.guildConfig.upsert.mockRejectedValue(new Error("DB locked"));
      const interaction = mi({ action: "on" });
      await handleCommand(interaction, mockClient);

      expect(logger.error).toHaveBeenCalledWith(
        "[CRASH CRITIQUE ANTIRAID]:",
        expect.any(Error)
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Impossible"),
        })
      );
    });

    it("survit si editReply dans le catch echoue aussi", async () => {
      mockPrisma.guildConfig.upsert.mockRejectedValue(new Error("DB locked"));
      const interaction = mi({ action: "on" });
      interaction.editReply.mockRejectedValueOnce(new Error("edit failed"));
      await expect(
        handleCommand(interaction, mockClient)
      ).resolves.toBeUndefined();
    });
  });
});
