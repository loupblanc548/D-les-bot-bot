"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockRequireAdmin, mockVoice } = vitest_1.vi.hoisted(() => ({
    mockLogger: { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() },
    mockRequireAdmin: vitest_1.vi.fn(),
    mockVoice: {
        joinVoiceChannel: vitest_1.vi.fn(),
        getVoiceConnection: vitest_1.vi.fn(),
        VoiceConnectionStatus: {
            Ready: "ready",
            Disconnected: "disconnected",
            Destroyed: "destroyed",
        },
    },
}));
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
vitest_1.vi.mock("../services/permissions", () => ({ requireAdmin: mockRequireAdmin }));
vitest_1.vi.mock("@discordjs/voice", () => mockVoice);
const vocal_1 = require("./vocal");
function mi(opts = {}) {
    const voiceChannel = ("voiceChannel" in opts) ? opts.voiceChannel : { id: "vc-111", name: "Salon Vocal", joinable: true };
    return {
        commandName: "vocal",
        user: {
            id: opts.userId ?? "user-456",
            tag: opts.userTag ?? "TestUser#1234",
        },
        guildId: opts.guildId ?? "guild-789",
        guild: { voiceAdapterCreator: {} },
        member: {
            voice: { channel: voiceChannel },
        },
        options: {
            getString: vitest_1.vi.fn((name, required) => {
                if (name === "action")
                    return opts.action ?? "rejoindre";
                return null;
            }),
        },
        deferReply: vitest_1.vi.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
        editReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        reply: vitest_1.vi.fn().mockResolvedValue(undefined),
        deferred: false,
        replied: false,
    };
}
function getEditReplyEmbeds(interaction) {
    const call = interaction.editReply.mock.calls[0]?.[0];
    return call?.embeds ?? [];
}
function getFirstEmbed(interaction) {
    return getEditReplyEmbeds(interaction)[0]?.data ?? null;
}
function getEditReplyContent(interaction) {
    return interaction.editReply.mock.calls[0]?.[0]?.content ?? "";
}
// ── Mock connection factory ────────────────────────────────────
function mockConnection(channelId = "vc-111") {
    const conn = {
        joinConfig: { channelId },
        destroy: vitest_1.vi.fn(),
        once: vitest_1.vi.fn(),
    };
    return conn;
}
// ════════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handleCommand – vocal", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockRequireAdmin.mockResolvedValue(true);
        mockVoice.getVoiceConnection.mockReturnValue(null);
        mockVoice.joinVoiceChannel.mockReturnValue(mockConnection());
    });
    // ── Admin check ──────────────────────────────────────────
    (0, vitest_1.describe)("admin check", () => {
        (0, vitest_1.it)("rejette l'accès si requireAdmin retourne false", async () => {
            mockRequireAdmin.mockResolvedValue(false);
            const interaction = mi({ action: "rejoindre" });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(interaction.deferReply).not.toHaveBeenCalled();
        });
    });
    // ── /vocal rejoindre ─────────────────────────────────────
    (0, vitest_1.describe)("/vocal rejoindre", () => {
        (0, vitest_1.it)("rejette si l'utilisateur n'est pas dans un salon vocal", async () => {
            const interaction = mi({ action: "rejoindre", voiceChannel: null });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("Vous devez être dans un salon vocal");
        });
        (0, vitest_1.it)("rejette si le salon vocal n'est pas joignable", async () => {
            const interaction = mi({
                action: "rejoindre",
                voiceChannel: { id: "vc-lock", name: "Salon Privé", joinable: false },
            });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("permission de rejoindre");
        });
        (0, vitest_1.it)("rejoint le salon vocal et confirme avec un embed", async () => {
            const interaction = mi({
                action: "rejoindre",
                voiceChannel: { id: "vc-222", name: "Musique 🎵", joinable: true },
            });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(mockVoice.joinVoiceChannel).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                channelId: "vc-222",
                guildId: "guild-789",
                selfDeaf: false,
                selfMute: false,
            }));
            const embed = getFirstEmbed(interaction);
            (0, vitest_1.expect)(embed).not.toBeNull();
            (0, vitest_1.expect)(embed.title).toContain("Connexion vocale");
            (0, vitest_1.expect)(embed.description).toContain("Musique 🎵");
            (0, vitest_1.expect)(embed.color).toBe(0x57f287);
        });
        (0, vitest_1.it)("détruit l'ancienne connexion si le bot est déjà dans un autre salon", async () => {
            const oldConn = mockConnection("vc-999");
            mockVoice.getVoiceConnection.mockReturnValue(oldConn);
            const interaction = mi({
                action: "rejoindre",
                voiceChannel: { id: "vc-222", name: "Nouveau Salon", joinable: true },
            });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(oldConn.destroy).toHaveBeenCalled();
            (0, vitest_1.expect)(mockVoice.joinVoiceChannel).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ channelId: "vc-222" }));
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Connexion précédente détruite"));
        });
        (0, vitest_1.it)("ne rejoint pas si déjà dans le même salon", async () => {
            const conn = mockConnection("vc-111");
            mockVoice.getVoiceConnection.mockReturnValue(conn);
            const interaction = mi({
                action: "rejoindre",
                voiceChannel: { id: "vc-111", name: "Salon Vocal", joinable: true },
            });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("Je suis déjà dans");
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("Salon Vocal");
            (0, vitest_1.expect)(mockVoice.joinVoiceChannel).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("logge l'action de join", async () => {
            const interaction = mi({ action: "rejoindre" });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("TestUser#1234"));
        });
    });
    // ── /vocal quitter ───────────────────────────────────────
    (0, vitest_1.describe)("/vocal quitter", () => {
        (0, vitest_1.it)("rejette si le bot n'est pas connecté", async () => {
            mockVoice.getVoiceConnection.mockReturnValue(null);
            const interaction = mi({ action: "quitter" });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("aucun salon vocal");
        });
        (0, vitest_1.it)("détruit la connexion et confirme avec un embed", async () => {
            const conn = mockConnection("vc-333");
            mockVoice.getVoiceConnection.mockReturnValue(conn);
            const interaction = mi({ action: "quitter" });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(conn.destroy).toHaveBeenCalled();
            const embed = getFirstEmbed(interaction);
            (0, vitest_1.expect)(embed).not.toBeNull();
            (0, vitest_1.expect)(embed.title).toContain("Déconnexion vocale");
            (0, vitest_1.expect)(embed.color).toBe(0xed4245);
        });
        (0, vitest_1.it)("logge l'action de leave", async () => {
            const conn = mockConnection("vc-333");
            mockVoice.getVoiceConnection.mockReturnValue(conn);
            const interaction = mi({ action: "quitter" });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("quitté"));
        });
    });
    // ── Error handling ───────────────────────────────────────
    (0, vitest_1.describe)("gestion d'erreur", () => {
        (0, vitest_1.it)("gère l'erreur quand joinVoiceChannel lève une exception", async () => {
            mockVoice.joinVoiceChannel.mockRejectedValue(new Error("Cannot join voice channel"));
            const interaction = mi({ action: "rejoindre" });
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalled();
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("Erreur");
        });
        (0, vitest_1.it)("utilise reply si ni deferred ni replied après erreur", async () => {
            mockVoice.joinVoiceChannel.mockRejectedValue(new Error("Join failed"));
            const interaction = mi({ action: "rejoindre" });
            interaction.deferred = false;
            interaction.replied = false;
            await (0, vocal_1.handleCommand)(interaction);
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=vocal.test.js.map