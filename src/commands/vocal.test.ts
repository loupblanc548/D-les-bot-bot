import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockRequireAdmin, mockVoice } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockRequireAdmin: vi.fn(),
  mockVoice: {
    joinVoiceChannel: vi.fn(),
    getVoiceConnection: vi.fn(),
    VoiceConnectionStatus: {
      Ready: "ready",
      Disconnected: "disconnected",
      Destroyed: "destroyed",
    },
  },
}));

vi.mock("../utils/logger", () => ({ default: mockLogger }));
vi.mock("../services/permissions", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@discordjs/voice", () => mockVoice);

import { handleCommand } from "./vocal.js";
import type { ChatInputCommandInteraction } from "discord.js";

// ── Helpers ────────────────────────────────────────────────────

interface MIOpts {
  action?: string;
  userId?: string;
  userTag?: string;
  guildId?: string;
  voiceChannel?: { id: string; name: string; joinable?: boolean } | null;
  existingConnection?: {
    joinConfig: { channelId: string };
    destroy: ReturnType<typeof vi.fn>;
  } | null;
}

function mi(opts: MIOpts = {}): ChatInputCommandInteraction {
  const voiceChannel =
    "voiceChannel" in opts
      ? opts.voiceChannel
      : { id: "vc-111", name: "Salon Vocal", joinable: true };
  return {
    commandName: "vocal",
    user: {
      id: opts.userId ?? "user-456",
      tag: opts.userTag ?? "TestUser#1234",
    },
    guildId: opts.guildId ?? "guild-789",
    guild: { voiceAdapterCreator: {} as any },
    member: {
      voice: { channel: voiceChannel },
    } as any,
    options: {
      getString: vi.fn((name: string, _required?: boolean) => {
        if (name === "action") return opts.action ?? "rejoindre";
        return null;
      }),
    },
    deferReply: vi.fn().mockImplementation(function (this: any) {
      this.deferred = true;
      return Promise.resolve();
    }),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    deferred: false,
    replied: false,
  } as unknown as ChatInputCommandInteraction;
}

function getEditReplyEmbeds(interaction: any) {
  const call = interaction.editReply.mock.calls[0]?.[0];
  return call?.embeds ?? [];
}

function getFirstEmbed(interaction: any) {
  return getEditReplyEmbeds(interaction)[0]?.data ?? null;
}

function getEditReplyContent(interaction: any) {
  return interaction.editReply.mock.calls[0]?.[0]?.content ?? "";
}

// ── Mock connection factory ────────────────────────────────────
function mockConnection(channelId: string = "vc-111") {
  const conn = {
    joinConfig: { channelId },
    destroy: vi.fn(),
    once: vi.fn(),
  };
  return conn;
}

// ════════════════════════════════════════════════════════════════

describe("handleCommand – vocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(true);
    mockVoice.getVoiceConnection.mockReturnValue(null);
    mockVoice.joinVoiceChannel.mockReturnValue(mockConnection());
  });

  // ── Admin check ──────────────────────────────────────────

  describe("admin check", () => {
    it("rejette l'accès si requireAdmin retourne false", async () => {
      mockRequireAdmin.mockResolvedValue(false);
      const interaction = mi({ action: "rejoindre" });
      await handleCommand(interaction);
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });
  });

  // ── /vocal rejoindre ─────────────────────────────────────

  describe("/vocal rejoindre", () => {
    it("rejette si l'utilisateur n'est pas dans un salon vocal", async () => {
      const interaction = mi({ action: "rejoindre", voiceChannel: null });
      await handleCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(getEditReplyContent(interaction)).toContain("Vous devez être dans un salon vocal");
    });

    it("rejette si le salon vocal n'est pas joignable", async () => {
      const interaction = mi({
        action: "rejoindre",
        voiceChannel: { id: "vc-lock", name: "Salon Privé", joinable: false },
      });
      await handleCommand(interaction);

      expect(getEditReplyContent(interaction)).toContain("permission de rejoindre");
    });

    it("rejoint le salon vocal et confirme avec un embed", async () => {
      const interaction = mi({
        action: "rejoindre",
        voiceChannel: { id: "vc-222", name: "Musique 🎵", joinable: true },
      });

      await handleCommand(interaction);

      expect(mockVoice.joinVoiceChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: "vc-222",
          guildId: "guild-789",
          selfDeaf: false,
          selfMute: false,
        }),
      );

      const embed = getFirstEmbed(interaction);
      expect(embed).not.toBeNull();
      expect(embed.title).toContain("Connexion vocale");
      expect(embed.description).toContain("Musique 🎵");
      expect(embed.color).toBe(0x57f287);
    });

    it("détruit l'ancienne connexion si le bot est déjà dans un autre salon", async () => {
      const oldConn = mockConnection("vc-999");
      mockVoice.getVoiceConnection.mockReturnValue(oldConn);

      const interaction = mi({
        action: "rejoindre",
        voiceChannel: { id: "vc-222", name: "Nouveau Salon", joinable: true },
      });
      await handleCommand(interaction);

      expect(oldConn.destroy).toHaveBeenCalled();
      expect(mockVoice.joinVoiceChannel).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: "vc-222" }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Connexion précédente détruite"),
      );
    });

    it("ne rejoint pas si déjà dans le même salon", async () => {
      const conn = mockConnection("vc-111");
      mockVoice.getVoiceConnection.mockReturnValue(conn);

      const interaction = mi({
        action: "rejoindre",
        voiceChannel: { id: "vc-111", name: "Salon Vocal", joinable: true },
      });
      await handleCommand(interaction);

      expect(getEditReplyContent(interaction)).toContain("Je suis déjà dans");
      expect(getEditReplyContent(interaction)).toContain("Salon Vocal");
      expect(mockVoice.joinVoiceChannel).not.toHaveBeenCalled();
    });

    it("logge l'action de join", async () => {
      const interaction = mi({ action: "rejoindre" });
      await handleCommand(interaction);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("TestUser#1234"));
    });
  });

  // ── /vocal quitter ───────────────────────────────────────

  describe("/vocal quitter", () => {
    it("rejette si le bot n'est pas connecté", async () => {
      mockVoice.getVoiceConnection.mockReturnValue(null);
      const interaction = mi({ action: "quitter" });

      await handleCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(getEditReplyContent(interaction)).toContain("aucun salon vocal");
    });

    it("détruit la connexion et confirme avec un embed", async () => {
      const conn = mockConnection("vc-333");
      mockVoice.getVoiceConnection.mockReturnValue(conn);

      const interaction = mi({ action: "quitter" });
      await handleCommand(interaction);

      expect(conn.destroy).toHaveBeenCalled();

      const embed = getFirstEmbed(interaction);
      expect(embed).not.toBeNull();
      expect(embed.title).toContain("Déconnexion vocale");
      expect(embed.color).toBe(0xed4245);
    });

    it("logge l'action de leave", async () => {
      const conn = mockConnection("vc-333");
      mockVoice.getVoiceConnection.mockReturnValue(conn);

      const interaction = mi({ action: "quitter" });
      await handleCommand(interaction);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("quitté"));
    });
  });

  // ── Error handling ───────────────────────────────────────

  describe("gestion d'erreur", () => {
    it("gère l'erreur quand joinVoiceChannel lève une exception", async () => {
      mockVoice.joinVoiceChannel.mockRejectedValue(new Error("Cannot join voice channel"));

      const interaction = mi({ action: "rejoindre" });
      await handleCommand(interaction);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(getEditReplyContent(interaction)).toContain("Erreur");
    });

    it("utilise reply si ni deferred ni replied après erreur", async () => {
      mockVoice.joinVoiceChannel.mockRejectedValue(new Error("Join failed"));
      const interaction = mi({ action: "rejoindre" });
      (interaction as any).deferred = false;
      (interaction as any).replied = false;

      await handleCommand(interaction);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
