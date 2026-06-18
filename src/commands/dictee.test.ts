import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockRequireAdmin, mockDictation } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockRequireAdmin: vi.fn(),
  mockDictation: {
    startDictation: vi.fn(),
    stopDictation: vi.fn(),
    hasActiveSession: vi.fn(),
    cancelDictation: vi.fn(),
  },
}));

vi.mock("../utils/logger", () => ({ default: mockLogger }));
vi.mock("../services/permissions", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("../services/dictation", () => mockDictation);

import { handleCommand } from "./dictee.js";
import type { ChatInputCommandInteraction, Client } from "discord.js";

// ── Helpers ────────────────────────────────────────────────────

interface MIOpts {
  action?: string;
  userId?: string;
  userTag?: string;
  displayName?: string;
  guildId?: string;
  voiceChannel?: { id: string; name: string } | null;
  targetChannel?: { id: string; name: string; type: number } | null;
  deferred?: boolean;
}

function mi(opts: MIOpts = {}): ChatInputCommandInteraction {
  const voiceChannel = ("voiceChannel" in opts) ? opts.voiceChannel : { id: "vc-123", name: "Général" };
  return {
    commandName: "dictee",
    user: {
      id: opts.userId ?? "user-456",
      tag: opts.userTag ?? "TestUser#1234",
      displayName: opts.displayName ?? "TestUser",
    },
    guildId: opts.guildId ?? "guild-789",
    guild: { voiceAdapterCreator: {} as any },
    member: {
      voice: { channel: voiceChannel },
    } as any,
    options: {
      getString: vi.fn((name: string, required?: boolean) => {
        if (name === "action") return opts.action ?? "start";
        return null;
      }),
      getChannel: vi.fn((name: string) => {
        if (name === "salon") return ("targetChannel" in opts) ? opts.targetChannel : { id: "ch-999", name: "dictée", type: 0 };
        return null;
      }),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    deferred: opts.deferred ?? false,
    replied: false,
  } as unknown as ChatInputCommandInteraction;
}

function getReplyContent(interaction: any) {
  return interaction.reply.mock.calls[0]?.[0]?.content ?? "";
}

function getEditReplyContent(interaction: any) {
  return interaction.editReply.mock.calls[0]?.[0]?.content ?? "";
}

const mockClient = {
  channels: {
    fetch: vi.fn(),
  },
} as unknown as Client;

// ════════════════════════════════════════════════════════════════

describe("handleCommand – dictee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(true);
    mockDictation.hasActiveSession.mockReturnValue(false);
    mockDictation.startDictation.mockResolvedValue(undefined);
    mockDictation.stopDictation.mockResolvedValue(null);
    mockDictation.cancelDictation.mockResolvedValue(undefined);
    (mockClient.channels.fetch as any).mockResolvedValue(null);
  });

  // ── Admin check ──────────────────────────────────────────

  describe("admin check", () => {
    it("rejette l'accès si requireAdmin retourne false", async () => {
      mockRequireAdmin.mockResolvedValue(false);
      const interaction = mi({ action: "start" });
      await handleCommand(interaction, mockClient);
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });

  // ── /dictee start ────────────────────────────────────────

  describe("/dictee start", () => {
    it("rejette si le membre n'est pas trouvé", async () => {
      const interaction = mi({ action: "start" });
      (interaction as any).member = null;

      await handleCommand(interaction, mockClient);

      expect(getReplyContent(interaction)).toContain("Impossible de trouver ton membre");
    });

    it("rejette si l'utilisateur n'est pas dans un salon vocal", async () => {
      const interaction = mi({ action: "start", voiceChannel: null });

      await handleCommand(interaction, mockClient);

      expect(getReplyContent(interaction)).toContain("Tu dois être dans un salon vocal");
    });

    it("rejette si le salon cible est invalide", async () => {
      const interaction = mi({ action: "start", targetChannel: null });

      await handleCommand(interaction, mockClient);

      expect(getReplyContent(interaction)).toContain("spécifier un salon textuel");
    });

    it("démarre la dictée et confirme", async () => {
      const interaction = mi({ action: "start", targetChannel: { id: "ch-999", name: "dictée", type: 0 } });

      await handleCommand(interaction, mockClient);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(mockDictation.startDictation).toHaveBeenCalledWith(
        "vc-123",
        "guild-789",
        expect.anything(),
        "user-456",
        "TestUser",
        "ch-999"
      );
      expect(getEditReplyContent(interaction)).toContain("Dictée démarrée");
      expect(getEditReplyContent(interaction)).toContain("<#ch-999>");
    });

    it("affiche l'erreur de startDictation dans editReply", async () => {
      mockDictation.startDictation.mockRejectedValue(new Error("Connexion vocale impossible"));
      const interaction = mi({ action: "start" });

      await handleCommand(interaction, mockClient);

      expect(getEditReplyContent(interaction)).toContain("❌ Connexion vocale impossible");
    });
  });

  // ── /dictee stop ─────────────────────────────────────────

  describe("/dictee stop", () => {
    it("rejette si aucune session active", async () => {
      mockDictation.hasActiveSession.mockReturnValue(false);
      const interaction = mi({ action: "stop" });

      await handleCommand(interaction, mockClient);

      expect(getReplyContent(interaction)).toContain("Tu n'as pas de dictée en cours");
    });

    it("gère le cas où stopDictation retourne null", async () => {
      mockDictation.hasActiveSession.mockReturnValue(true);
      mockDictation.stopDictation.mockResolvedValue(null);
      const interaction = mi({ action: "stop" });

      await handleCommand(interaction, mockClient);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(mockDictation.stopDictation).toHaveBeenCalledWith("user-456");
      expect(getEditReplyContent(interaction)).toContain("Aucune dictée trouvée");
    });

    it("termine la dictée, envoie le texte dans le salon cible et confirme", async () => {
      const result = {
        text: "Bonjour, ceci est un test de dictée vocale",
        username: "TestUser",
        targetChannelId: "ch-999",
      };
      mockDictation.hasActiveSession.mockReturnValue(true);
      mockDictation.stopDictation.mockResolvedValue(result);

      const mockTextChannel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
      (mockClient.channels.fetch as any).mockResolvedValue(mockTextChannel);

      const interaction = mi({ action: "stop" });
      await handleCommand(interaction, mockClient);

      expect(mockClient.channels.fetch).toHaveBeenCalledWith("ch-999");
      expect(mockTextChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Bonjour, ceci est un test de dictée vocale"),
        })
      );
      expect(getEditReplyContent(interaction)).toContain("Dictée terminée");
      expect(getEditReplyContent(interaction)).toContain("<#ch-999>");
    });

    it("gère le cas où le salon cible n'est pas accessible", async () => {
      const result = {
        text: "Texte de test",
        username: "TestUser",
        targetChannelId: "ch-404",
      };
      mockDictation.hasActiveSession.mockReturnValue(true);
      mockDictation.stopDictation.mockResolvedValue(result);
      (mockClient.channels.fetch as any).mockRejectedValue(new Error("Unknown Channel"));

      const interaction = mi({ action: "stop" });
      await handleCommand(interaction, mockClient);

      expect(getEditReplyContent(interaction)).toContain("Dictée terminée");
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("tronque la transcription à 300 caractères", async () => {
      const longText = "A".repeat(400);
      const result = { text: longText, username: "TestUser", targetChannelId: "ch-999" };
      mockDictation.hasActiveSession.mockReturnValue(true);
      mockDictation.stopDictation.mockResolvedValue(result);

      const mockTextChannel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
      (mockClient.channels.fetch as any).mockResolvedValue(mockTextChannel);

      const interaction = mi({ action: "stop" });
      await handleCommand(interaction, mockClient);

      const content = getEditReplyContent(interaction);
      expect(content).toContain("...");
      expect(content.length).toBeLessThan(400);
    });

    it("affiche 'aucun texte' si la transcription est vide", async () => {
      const result = { text: "", username: "TestUser", targetChannelId: "ch-999" };
      mockDictation.hasActiveSession.mockReturnValue(true);
      mockDictation.stopDictation.mockResolvedValue(result);

      const mockTextChannel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
      (mockClient.channels.fetch as any).mockResolvedValue(mockTextChannel);

      const interaction = mi({ action: "stop" });
      await handleCommand(interaction, mockClient);

      expect(getEditReplyContent(interaction)).toContain("aucun texte");
      expect(mockTextChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("aucun texte détecté") })
      );
    });
  });

  // ── Error handling ───────────────────────────────────────

  describe("gestion d'erreur", () => {
    it("appelle cancelDictation après crash si une session était active", async () => {
      mockDictation.hasActiveSession.mockReturnValue(true);
      mockDictation.stopDictation.mockRejectedValue(new Error("DB crash"));
      const interaction = mi({ action: "stop" });

      await handleCommand(interaction, mockClient);

      expect(mockDictation.cancelDictation).toHaveBeenCalledWith("user-456");
    });

    it("utilise followUp si impossible de reply/editReply après crash", async () => {
      mockDictation.hasActiveSession.mockReturnValue(true);
      mockDictation.stopDictation.mockRejectedValue(new Error("DB crash"));
      const interaction = mi({ action: "stop" });
      (interaction as any).deferred = false;
      (interaction as any).replied = false;
      // Force reply and editReply to fail so followUp is used as fallback
      (interaction as any).reply = vi.fn().mockRejectedValue(new Error("Cannot reply"));
      (interaction as any).editReply = vi.fn().mockRejectedValue(new Error("Cannot edit"));

      await handleCommand(interaction, mockClient);

      expect(interaction.followUp).toHaveBeenCalled();
      expect(mockDictation.cancelDictation).toHaveBeenCalledWith("user-456");
    });
  });
});
