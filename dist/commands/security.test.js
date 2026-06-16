"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ── Hoisted mocks (before any imports) ─────────────────────────────────────
const { mockPrisma, mockConfig, mockCreateLog } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        guildConfig: {
            upsert: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
        },
    },
    mockConfig: { config: { ownerId: "owner1", adminRoles: [], modRoles: [] } },
    mockCreateLog: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../prisma", () => ({ default: mockPrisma }));
vitest_1.vi.mock("../config", () => mockConfig);
vitest_1.vi.mock("../services/logs", () => ({ createLog: mockCreateLog }));
vitest_1.vi.mock("../utils/logger", () => ({
    default: {
        info: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
    },
}));
const security_1 = require("./security");
const logger_1 = __importDefault(require("../utils/logger"));
// ── Mock interaction builder ────────────────────────────────────────────────
function mi(o = {}) {
    const interaction = {
        commandName: o.commandName ?? "antiraid",
        options: {
            getString: vitest_1.vi.fn((name) => {
                if (name === "action")
                    return o.action ?? "on";
                return null;
            }),
            getInteger: vitest_1.vi.fn((name) => {
                if (name === "seuil_heures")
                    return o.seuilHeures ?? null;
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
        deferReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        editReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        reply: vitest_1.vi.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
    };
    return interaction;
}
const mockClient = {};
// ── Tests ───────────────────────────────────────────────────────────────────
(0, vitest_1.describe)("handleAntiraid (via handleCommand)", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.spyOn(console, "log").mockImplementation(() => { });
        vitest_1.vi.spyOn(console, "error").mockImplementation(() => { });
    });
    // ── guildId null ───────────────────────────────────────────────────────
    (0, vitest_1.describe)("guildId null", () => {
        (0, vitest_1.it)("repond avec erreur si hors serveur (guildId = null)", async () => {
            const interaction = mi({ guildId: null });
            await (0, security_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith({
                content: vitest_1.expect.stringContaining("serveur"),
            });
            (0, vitest_1.expect)(mockPrisma.guildConfig.upsert).not.toHaveBeenCalled();
        });
    });
    // ── Action "on" ────────────────────────────────────────────────────────
    (0, vitest_1.describe)('action "on"', () => {
        (0, vitest_1.it)("active avec seuil par defaut (24h)", async () => {
            mockPrisma.guildConfig.upsert.mockResolvedValue({});
            const interaction = mi({ action: "on" });
            await (0, security_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(mockPrisma.guildConfig.upsert).toHaveBeenCalledWith({
                where: { guildId: "g1" },
                update: { antiRaidEnabled: true, antiRaidSeuilHeures: 24 },
                create: { guildId: "g1", antiRaidEnabled: true, antiRaidSeuilHeures: 24 },
            });
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        });
        (0, vitest_1.it)("active avec seuil personnalise (12h)", async () => {
            mockPrisma.guildConfig.upsert.mockResolvedValue({});
            const interaction = mi({ action: "on", seuilHeures: 12 });
            await (0, security_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(mockPrisma.guildConfig.upsert).toHaveBeenCalledWith({
                where: { guildId: "g1" },
                update: { antiRaidEnabled: true, antiRaidSeuilHeures: 12 },
                create: { guildId: "g1", antiRaidEnabled: true, antiRaidSeuilHeures: 12 },
            });
        });
        (0, vitest_1.it)("envoie un embed de confirmation", async () => {
            mockPrisma.guildConfig.upsert.mockResolvedValue({});
            const interaction = mi({ action: "on" });
            await (0, security_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                embeds: vitest_1.expect.any(Array),
            }));
        });
    });
    // ── Action "off" ───────────────────────────────────────────────────────
    (0, vitest_1.describe)('action "off"', () => {
        (0, vitest_1.it)("desactive l'anti-raid", async () => {
            mockPrisma.guildConfig.upsert.mockResolvedValue({});
            await (0, security_1.handleCommand)(mi({ action: "off" }), mockClient);
            (0, vitest_1.expect)(mockPrisma.guildConfig.upsert).toHaveBeenCalledWith({
                where: { guildId: "g1" },
                update: { antiRaidEnabled: false },
                create: { guildId: "g1", antiRaidEnabled: false },
            });
        });
        (0, vitest_1.it)("envoie un embed de confirmation", async () => {
            mockPrisma.guildConfig.upsert.mockResolvedValue({});
            const interaction = mi({ action: "off" });
            await (0, security_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                embeds: vitest_1.expect.any(Array),
            }));
        });
    });
    // ── Action "status" ────────────────────────────────────────────────────
    (0, vitest_1.describe)('action "status"', () => {
        (0, vitest_1.it)("affiche INACTIF si la config n'existe pas", async () => {
            mockPrisma.guildConfig.findUnique.mockResolvedValue(null);
            const interaction = mi({ action: "status" });
            await (0, security_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(mockPrisma.guildConfig.findUnique).toHaveBeenCalledWith({
                where: { guildId: "g1" },
            });
            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            (0, vitest_1.expect)(embed.data.description).toBe("**INACTIF**");
        });
        (0, vitest_1.it)("affiche ACTIF si active", async () => {
            mockPrisma.guildConfig.findUnique.mockResolvedValue({
                antiRaidEnabled: true,
                antiRaidSeuilHeures: 48,
            });
            const interaction = mi({ action: "status" });
            await (0, security_1.handleCommand)(interaction, mockClient);
            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            (0, vitest_1.expect)(embed.data.description).toContain("**ACTIF**");
            (0, vitest_1.expect)(embed.data.description).toContain("48h");
        });
        (0, vitest_1.it)("affiche INACTIF si antiRaidEnabled est false", async () => {
            mockPrisma.guildConfig.findUnique.mockResolvedValue({
                antiRaidEnabled: false,
                antiRaidSeuilHeures: 24,
            });
            const interaction = mi({ action: "status" });
            await (0, security_1.handleCommand)(interaction, mockClient);
            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            (0, vitest_1.expect)(embed.data.description).toBe("**INACTIF**");
        });
    });
    // ── Action inconnue ────────────────────────────────────────────────────
    (0, vitest_1.describe)("action inconnue", () => {
        (0, vitest_1.it)("ne fait rien et n'appelle pas Prisma", async () => {
            const interaction = mi({ action: "foo" });
            await (0, security_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(mockPrisma.guildConfig.upsert).not.toHaveBeenCalled();
            (0, vitest_1.expect)(mockPrisma.guildConfig.findUnique).not.toHaveBeenCalled();
            // deferReply est quand meme appele (premiere ligne)
            (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        });
    });
    // ── Erreur Prisma ─────────────────────────────────────────────────────
    (0, vitest_1.describe)("erreurs", () => {
        (0, vitest_1.it)("capture erreur Prisma sur upsert", async () => {
            mockPrisma.guildConfig.upsert.mockRejectedValue(new Error("DB locked"));
            const interaction = mi({ action: "on" });
            await (0, security_1.handleCommand)(interaction, mockClient);
            (0, vitest_1.expect)(logger_1.default.error).toHaveBeenCalledWith("[CRASH CRITIQUE ANTIRAID]:", vitest_1.expect.any(Error));
            (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                content: vitest_1.expect.stringContaining("Impossible"),
            }));
        });
        (0, vitest_1.it)("survit si editReply dans le catch echoue aussi", async () => {
            mockPrisma.guildConfig.upsert.mockRejectedValue(new Error("DB locked"));
            const interaction = mi({ action: "on" });
            interaction.editReply.mockRejectedValueOnce(new Error("edit failed"));
            await (0, vitest_1.expect)((0, security_1.handleCommand)(interaction, mockClient)).resolves.toBeUndefined();
        });
    });
});
//# sourceMappingURL=security.test.js.map