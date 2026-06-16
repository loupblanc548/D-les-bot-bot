"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockRequireAdmin, mockDictation } = vitest_1.vi.hoisted(() => ({
    mockLogger: { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() },
    mockRequireAdmin: vitest_1.vi.fn(),
    mockDictation: {
        startDictation: vitest_1.vi.fn(),
        stopDictation: vitest_1.vi.fn(),
        hasActiveSession: vitest_1.vi.fn(),
        cancelDictation: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
vitest_1.vi.mock("../services/permissions", () => ({ requireAdmin: mockRequireAdmin }));
vitest_1.vi.mock("../services/dictation", () => mockDictation);
const dictee_1 = require("./dictee");
function mi(opts = {}) {
    const voiceChannel = ("voiceChannel" in opts) ? opts.voiceChannel : { id: "vc-123", name: "Général" };
    return {
        commandName: "dictee",
        user: {
            id: opts.userId ?? "user-456",
            tag: opts.userTag ?? "TestUser#1234",
            displayName: opts.displayName ?? "TestUser",
        },
        guildId: opts.guildId ?? "guild-789",
        guild: { voiceAdapterCreator: {} },
        member: {
            voice: { channel: voiceChannel },
        },
        options: {
            getString: vitest_1.vi.fn((name, required) => {
                if (name === "action")
                    return opts.action ?? "start";
                return null;
            }),
            getChannel: vitest_1.vi.fn((name) => {
                if (name === "salon")
                    return ("targetChannel" in opts) ? opts.targetChannel : { id: "ch-999", name: "dictée", type: 0 };
                return null;
            }),
        },
        deferReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        editReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        reply: vitest_1.vi.fn().mockResolvedValue(undefined),
        followUp: vitest_1.vi.fn().mockResolvedValue(undefined),
        deferred: opts.deferred ?? false,
        replied: false,
    };
}
function getReplyContent(interaction) {
    return interaction.reply.mock.calls[0]?.[0]?.content ?? "";
}
function getEditReplyContent(interaction) {
    return interaction.editReply.mock.calls[0]?.[0]?.content ?? "";
}
const mockClient = {
    channels: {
        fetch: vitest_1.vi.fn(),
    },
};
// ════════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handleCommand – dictee", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockRequireAdmin.mockResolvedValue(true);
        mockDictation.hasActiveSession.mockReturnValue(false);
        mockDictation.startDictation.mockResolvedValue(undefined);
        mockDictation.stopDictation.mockResolvedValue(null);
        mockDictation.cancelDictation.mockResolvedValue(undefined);
        mockClient.channels.fetch.mockResolvedValue(null);
    });
    // ── Admin check ──────────────────────────────────────────
    (0, vitest_1.describe)("admin check", () => {
        (0, vitest_1.it)("rejette l'accès si requireAdmin retourne false", async () => {
            mockRequireAdmin.mockResolvedValue(false);
            const interaction = mi({ action: "start" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(interaction.deferReply).not.toHaveBeenCalled();
            (0, vitest_1.expect)(interaction.reply).not.toHaveBeenCalled();
        });
    });
    // ── /dictee start ────────────────────────────────────────
    (0, vitest_1.describe)("/dictee start", () => {
        (0, vitest_1.it)("rejette si le membre n'est pas trouvé", async () => {
            const interaction = mi({ action: "start" });
            interaction.member = null;
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(getReplyContent(interaction)).toContain("Impossible de trouver ton membre");
        });
        (0, vitest_1.it)("rejette si l'utilisateur n'est pas dans un salon vocal", async () => {
            const interaction = mi({ action: "start", voiceChannel: null });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(getReplyContent(interaction)).toContain("Tu dois être dans un salon vocal");
        });
        (0, vitest_1.it)("rejette si le salon cible est invalide", async () => {
            const interaction = mi({ action: "start", targetChannel: null });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(getReplyContent(interaction)).toContain("spécifier un salon textuel");
        });
        (0, vitest_1.it)("démarre la dictée et confirme", async () => {
            const interaction = mi({ action: "start", targetChannel: { id: "ch-999", name: "dictée", type: 0 } });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
            (0, vitest_1.expect)(mockDictation.startDictation).toHaveBeenCalledWith("vc-123", "guild-789", vitest_1.expect.anything(), "user-456", "TestUser", "ch-999");
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("Dictée démarrée");
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("<#ch-999>");
        });
        (0, vitest_1.it)("affiche l'erreur de startDictation dans editReply", async () => {
            mockDictation.startDictation.mockRejectedValue(new Error("Connexion vocale impossible"));
            const interaction = mi({ action: "start" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("❌ Connexion vocale impossible");
        });
    });
    // ── /dictee stop ─────────────────────────────────────────
    (0, vitest_1.describe)("/dictee stop", () => {
        (0, vitest_1.it)("rejette si aucune session active", async () => {
            mockDictation.hasActiveSession.mockReturnValue(false);
            const interaction = mi({ action: "stop" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(getReplyContent(interaction)).toContain("Tu n'as pas de dictée en cours");
        });
        (0, vitest_1.it)("gère le cas où stopDictation retourne null", async () => {
            mockDictation.hasActiveSession.mockReturnValue(true);
            mockDictation.stopDictation.mockResolvedValue(null);
            const interaction = mi({ action: "stop" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
            (0, vitest_1.expect)(mockDictation.stopDictation).toHaveBeenCalledWith("user-456");
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("Aucune dictée trouvée");
        });
        (0, vitest_1.it)("termine la dictée, envoie le texte dans le salon cible et confirme", async () => {
            const result = {
                text: "Bonjour, ceci est un test de dictée vocale",
                username: "TestUser",
                targetChannelId: "ch-999",
            };
            mockDictation.hasActiveSession.mockReturnValue(true);
            mockDictation.stopDictation.mockResolvedValue(result);
            const mockTextChannel = { isTextBased: () => true, send: vitest_1.vi.fn().mockResolvedValue(undefined) };
            mockClient.channels.fetch.mockResolvedValue(mockTextChannel);
            const interaction = mi({ action: "stop" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(mockClient.channels.fetch).toHaveBeenCalledWith("ch-999");
            (0, vitest_1.expect)(mockTextChannel.send).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                content: vitest_1.expect.stringContaining("Bonjour, ceci est un test de dictée vocale"),
            }));
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("Dictée terminée");
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("<#ch-999>");
        });
        (0, vitest_1.it)("gère le cas où le salon cible n'est pas accessible", async () => {
            const result = {
                text: "Texte de test",
                username: "TestUser",
                targetChannelId: "ch-404",
            };
            mockDictation.hasActiveSession.mockReturnValue(true);
            mockDictation.stopDictation.mockResolvedValue(result);
            mockClient.channels.fetch.mockRejectedValue(new Error("Unknown Channel"));
            const interaction = mi({ action: "stop" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("Dictée terminée");
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalled();
        });
        (0, vitest_1.it)("tronque la transcription à 300 caractères", async () => {
            const longText = "A".repeat(400);
            const result = { text: longText, username: "TestUser", targetChannelId: "ch-999" };
            mockDictation.hasActiveSession.mockReturnValue(true);
            mockDictation.stopDictation.mockResolvedValue(result);
            const mockTextChannel = { isTextBased: () => true, send: vitest_1.vi.fn().mockResolvedValue(undefined) };
            mockClient.channels.fetch.mockResolvedValue(mockTextChannel);
            const interaction = mi({ action: "stop" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            const content = getEditReplyContent(interaction);
            (0, vitest_1.expect)(content).toContain("...");
            (0, vitest_1.expect)(content.length).toBeLessThan(400);
        });
        (0, vitest_1.it)("affiche 'aucun texte' si la transcription est vide", async () => {
            const result = { text: "", username: "TestUser", targetChannelId: "ch-999" };
            mockDictation.hasActiveSession.mockReturnValue(true);
            mockDictation.stopDictation.mockResolvedValue(result);
            const mockTextChannel = { isTextBased: () => true, send: vitest_1.vi.fn().mockResolvedValue(undefined) };
            mockClient.channels.fetch.mockResolvedValue(mockTextChannel);
            const interaction = mi({ action: "stop" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(getEditReplyContent(interaction)).toContain("aucun texte");
            (0, vitest_1.expect)(mockTextChannel.send).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ content: vitest_1.expect.stringContaining("aucun texte détecté") }));
        });
    });
    // ── Error handling ───────────────────────────────────────
    (0, vitest_1.describe)("gestion d'erreur", () => {
        (0, vitest_1.it)("appelle cancelDictation après crash si une session était active", async () => {
            mockDictation.hasActiveSession.mockReturnValue(true);
            mockDictation.stopDictation.mockRejectedValue(new Error("DB crash"));
            const interaction = mi({ action: "stop" });
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(mockDictation.cancelDictation).toHaveBeenCalledWith("user-456");
        });
        (0, vitest_1.it)("utilise followUp si impossible de reply/editReply après crash", async () => {
            mockDictation.hasActiveSession.mockReturnValue(true);
            mockDictation.stopDictation.mockRejectedValue(new Error("DB crash"));
            const interaction = mi({ action: "stop" });
            interaction.deferred = false;
            interaction.replied = false;
            // Force reply and editReply to fail so followUp is used as fallback
            interaction.reply = vitest_1.vi.fn().mockRejectedValue(new Error("Cannot reply"));
            interaction.editReply = vitest_1.vi.fn().mockRejectedValue(new Error("Cannot edit"));
            await (0, dictee_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(interaction.followUp).toHaveBeenCalled();
            (0, vitest_1.expect)(mockDictation.cancelDictation).toHaveBeenCalledWith("user-456");
        });
    });
});
//# sourceMappingURL=dictee.test.js.map