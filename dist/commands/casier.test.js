"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        sanction: {
            findUnique: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            delete: vitest_1.vi.fn(),
            deleteMany: vitest_1.vi.fn(),
        },
        log: { findMany: vitest_1.vi.fn() },
    },
}));
vitest_1.vi.mock("../prisma", () => ({ default: mockPrisma }));
vitest_1.vi.mock("../services/permissions", () => ({ requireMod: vitest_1.vi.fn().mockResolvedValue(true), requireAdmin: vitest_1.vi.fn().mockResolvedValue(true) }));
const casier_1 = require("./casier");
function mockUser(id, tag) {
    return { id, tag, username: tag.split("#")[0], displayName: tag, toString: () => "<@" + id + ">" };
}
function mockInteraction(overrides = {}) {
    return {
        options: {
            getUser: vitest_1.vi.fn().mockReturnValue(overrides.user ?? mockUser("target-1", "Target#1234")),
            getInteger: vitest_1.vi.fn().mockReturnValue(overrides.integerId ?? null),
            getString: vitest_1.vi.fn(),
        },
        user: overrides.caller ?? mockUser("mod-1", "Mod#0001"),
        guildId: "guildId" in overrides ? overrides.guildId : "guild-1",
        member: overrides.member ?? null,
        deferReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        editReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        reply: vitest_1.vi.fn().mockResolvedValue(undefined),
        followUp: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
}
(0, vitest_1.describe)("buildEntries", () => {
    (0, vitest_1.it)("should return an empty array when no sanctions exist", () => {
        (0, vitest_1.expect)((0, casier_1.buildEntries)([], [], [], [], [])).toEqual([]);
    });
    (0, vitest_1.it)("should group warnings under a WARN header", () => {
        const warns = [{ id: 1, type: "WARN", reason: "Spam en chat", moderatorId: "mod-1", createdAt: new Date("2025-01-15") }];
        const entries = (0, casier_1.buildEntries)(warns, [], [], [], []);
        (0, vitest_1.expect)(entries.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(entries.find((e) => e.isHeader)?.headerLine).toContain("Avertissements");
        (0, vitest_1.expect)(entries.some((e) => !e.isHeader && e.line.includes("Spam en chat"))).toBe(true);
    });
    (0, vitest_1.it)("should group mutes under a TIMEOUT header", () => {
        const createdAt = new Date("2025-02-20");
        const mutes = [{ id: 2, type: "TIMEOUT", reason: "Flood", moderatorId: "mod-2", createdAt, duration: 3600, endTime: new Date(createdAt.getTime() + 3600 * 1000) }];
        const entries = (0, casier_1.buildEntries)([], mutes, [], [], []);
        (0, vitest_1.expect)(entries.find((e) => e.isHeader)?.headerLine).toContain("Exclusions temporaires");
        (0, vitest_1.expect)(entries.some((e) => !e.isHeader && e.line.includes("60 min"))).toBe(true);
    });
    (0, vitest_1.it)("should group kicks under a KICK header", () => {
        const kicks = [{ id: 3, type: "KICK", reason: "Insultes", moderatorId: "mod-3", createdAt: new Date("2025-03-10"), duration: null }];
        const entries = (0, casier_1.buildEntries)([], [], kicks, [], []);
        (0, vitest_1.expect)(entries.find((e) => e.isHeader)?.headerLine).toContain("Expulsions");
        (0, vitest_1.expect)(entries.some((e) => !e.isHeader && e.line.includes("Insultes"))).toBe(true);
    });
    (0, vitest_1.it)("should include ban sanctions under a BAN header", () => {
        const bans = [{ id: 4, type: "BAN", reason: "Raid", moderatorId: "mod-4", createdAt: new Date("2025-04-01"), duration: null }];
        const entries = (0, casier_1.buildEntries)([], [], [], bans, []);
        (0, vitest_1.expect)(entries.find((e) => e.isHeader)?.headerLine).toContain("Bannissements");
    });
    (0, vitest_1.it)("should include log-based bans", () => {
        const logs = [{ id: "log-1", type: "BAN", action: "BAN", targetId: "target-1", details: "Banni pour comportement toxique", moderator: "mod-5", createdAt: new Date("2025-05-01") }];
        const entries = (0, casier_1.buildEntries)([], [], [], [], logs);
        (0, vitest_1.expect)(entries.some((e) => !e.isHeader && e.line.includes("BAN"))).toBe(true);
    });
    (0, vitest_1.it)("should include the sanction ID in entries", () => {
        const warns = [{ id: 42, type: "WARN", reason: "Test", moderatorId: "mod-1", createdAt: new Date() }];
        const entries = (0, casier_1.buildEntries)(warns, [], [], [], []);
        (0, vitest_1.expect)(entries.some((e) => !e.isHeader && e.line.includes("#1"))).toBe(true);
    });
    (0, vitest_1.it)("should include moderator mention in entries", () => {
        const warns = [{ id: 1, type: "WARN", reason: "Test", moderatorId: "mod-99", createdAt: new Date() }];
        const entries = (0, casier_1.buildEntries)(warns, [], [], [], []);
        (0, vitest_1.expect)(entries.some((e) => !e.isHeader && e.line.includes("mod-99"))).toBe(true);
    });
    (0, vitest_1.it)("should format duration in minutes", () => {
        const now = new Date();
        const mutes = [{ id: 5, type: "TIMEOUT", reason: "Spam", moderatorId: "mod-1", createdAt: now, duration: 7200, endTime: new Date(now.getTime() + 7200 * 1000) }];
        const entries = (0, casier_1.buildEntries)([], mutes, [], [], []);
        (0, vitest_1.expect)(entries.some((e) => !e.isHeader && e.line.includes("120 min"))).toBe(true);
    });
    (0, vitest_1.it)("should handle multiple sections in order", () => {
        const now = new Date();
        const warns = [{ id: 1, type: "WARN", reason: "W1", moderatorId: "m1", createdAt: now }];
        const mutes = [{ id: 2, type: "TIMEOUT", reason: "M1", moderatorId: "m2", createdAt: now, duration: 600, endTime: new Date(now.getTime() + 600 * 1000) }];
        const kicks = [{ id: 3, type: "KICK", reason: "K1", moderatorId: "m3", createdAt: now, duration: null }];
        const bans = [{ id: 4, type: "BAN", reason: "B1", moderatorId: "m4", createdAt: now, duration: null }];
        const entries = (0, casier_1.buildEntries)(warns, mutes, kicks, bans, []);
        const headers = entries.filter((e) => e.isHeader);
        (0, vitest_1.expect)(headers.length).toBeGreaterThanOrEqual(4);
        const headerTexts = headers.map((h) => h.headerLine);
        (0, vitest_1.expect)(headerTexts.some((h) => h.includes("Avertissements"))).toBe(true);
        (0, vitest_1.expect)(headerTexts.some((h) => h.includes("Exclusions temporaires"))).toBe(true);
        (0, vitest_1.expect)(headerTexts.some((h) => h.includes("Expulsions"))).toBe(true);
        (0, vitest_1.expect)(headerTexts.some((h) => h.includes("Bannissements"))).toBe(true);
    });
});
(0, vitest_1.describe)("chunkEntries", () => {
    (0, vitest_1.it)("should return a single page for small content", () => {
        const entries = [
            { section: "warn", isHeader: true, headerLine: "AVERTISSEMENTS (1)", line: "AVERTISSEMENTS (1)" },
            { section: "warn", isHeader: false, headerLine: "AVERTISSEMENTS (1)", line: ".. #1 .. Spam .. <@mod-1> .. 15/01/2025" },
        ];
        (0, vitest_1.expect)((0, casier_1.chunkEntries)(entries, 3800).length).toBe(1);
    });
    (0, vitest_1.it)("should split large content into multiple pages", () => {
        const entries = [];
        entries.push({ section: "warn", isHeader: true, headerLine: "AVERTISSEMENTS (200)", line: "AVERTISSEMENTS (200)" });
        for (let i = 0; i < 200; i++) {
            entries.push({ section: "warn", isHeader: false, headerLine: "AVERTISSEMENTS (200)", line: ".. #" + i + " .. Reason number " + i + " for testing pagination .. <@mod-" + i + "> .. 01/01/2025" });
        }
        const pages = (0, casier_1.chunkEntries)(entries, 3800);
        (0, vitest_1.expect)(pages.length).toBeGreaterThan(1);
        for (const page of pages)
            (0, vitest_1.expect)(page.length).toBeLessThanOrEqual(4096);
    });
    (0, vitest_1.it)("should handle empty entries", () => {
        (0, vitest_1.expect)((0, casier_1.chunkEntries)([], 3800)).toEqual([""]);
    });
    (0, vitest_1.it)("should keep entries intact within a page", () => {
        const entries = [
            { section: "warn", isHeader: true, headerLine: "TEST", line: "TEST" },
            { section: "warn", isHeader: false, headerLine: "TEST", line: "Line 1" },
            { section: "warn", isHeader: false, headerLine: "TEST", line: "Line 2" },
            { section: "warn", isHeader: false, headerLine: "TEST", line: "Line 3" },
        ];
        const pages = (0, casier_1.chunkEntries)(entries, 3800);
        (0, vitest_1.expect)(pages[0]).toContain("TEST");
        (0, vitest_1.expect)(pages[0]).toContain("Line 1");
        (0, vitest_1.expect)(pages[0]).toContain("Line 2");
        (0, vitest_1.expect)(pages[0]).toContain("Line 3");
    });
});
(0, vitest_1.describe)("buildNavRow", () => {
    (0, vitest_1.it)("should return an ActionRow with buttons", () => {
        (0, vitest_1.expect)((0, casier_1.buildNavRow)(0, 3).components.length).toBe(3);
    });
    (0, vitest_1.it)("should disable prev button on first page", () => {
        (0, vitest_1.expect)((0, casier_1.buildNavRow)(0, 3).components[0].data.disabled).toBe(true);
    });
    (0, vitest_1.it)("should disable next button on last page", () => {
        (0, vitest_1.expect)((0, casier_1.buildNavRow)(2, 3).components[2].data.disabled).toBe(true);
    });
    (0, vitest_1.it)("should enable both buttons on middle page", () => {
        const row = (0, casier_1.buildNavRow)(1, 3);
        (0, vitest_1.expect)(row.components[0].data.disabled).toBe(false);
        (0, vitest_1.expect)(row.components[2].data.disabled).toBe(false);
    });
});
(0, vitest_1.describe)("handleCasierClear", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should reply error when called without id or member", async () => {
        const interaction = mockInteraction();
        interaction.options.getInteger.mockReturnValue(null);
        interaction.options.getUser.mockReturnValue(null);
        await (0, casier_1.handleCasierClear)(interaction);
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ content: vitest_1.expect.stringContaining("Fournis un ID de sanction") }));
    });
    (0, vitest_1.it)("should delete a sanction by ID and reply success", async () => {
        mockPrisma.sanction.findUnique.mockResolvedValue({ id: 5, type: "WARN" });
        mockPrisma.sanction.delete.mockResolvedValue({});
        const interaction = mockInteraction({ integerId: 5 });
        await (0, casier_1.handleCasierClear)(interaction);
        (0, vitest_1.expect)(mockPrisma.sanction.findUnique).toHaveBeenCalledWith({ where: { id: 5 } });
        (0, vitest_1.expect)(mockPrisma.sanction.delete).toHaveBeenCalledWith({ where: { id: 5 } });
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ content: vitest_1.expect.stringContaining("Sanction #5") }));
    });
    (0, vitest_1.it)("should reply error when sanction ID not found", async () => {
        mockPrisma.sanction.findUnique.mockResolvedValue(null);
        const interaction = mockInteraction({ integerId: 999 });
        await (0, casier_1.handleCasierClear)(interaction);
        (0, vitest_1.expect)(mockPrisma.sanction.findUnique).toHaveBeenCalledWith({ where: { id: 999 } });
        (0, vitest_1.expect)(mockPrisma.sanction.delete).not.toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ content: vitest_1.expect.stringContaining("introuvable") }));
    });
    (0, vitest_1.it)("should delete all sanctions for a member", async () => {
        mockPrisma.sanction.deleteMany.mockResolvedValue({ count: 3 });
        const membre = mockUser("user-99", "BadUser#9999");
        const interaction = mockInteraction({ user: membre });
        interaction.options.getInteger.mockReturnValue(null);
        await (0, casier_1.handleCasierClear)(interaction);
        (0, vitest_1.expect)(mockPrisma.sanction.deleteMany).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ where: vitest_1.expect.objectContaining({ userId: "user-99" }) }));
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ content: vitest_1.expect.stringContaining("3 sanction(s)") }));
    });
});
(0, vitest_1.describe)("handleCommand", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should query sanctions and logs for the target user", async () => {
        mockPrisma.sanction.findMany.mockResolvedValue([]);
        mockPrisma.log.findMany.mockResolvedValue([]);
        const interaction = mockInteraction();
        interaction.commandName = "casier";
        await (0, casier_1.handleCommand)(interaction);
        (0, vitest_1.expect)(mockPrisma.sanction.findMany).toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.log.findMany).toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
    });
    (0, vitest_1.it)("should show vierge embed when no sanctions exist", async () => {
        mockPrisma.sanction.findMany.mockResolvedValue([]);
        mockPrisma.log.findMany.mockResolvedValue([]);
        const interaction = mockInteraction();
        interaction.commandName = "casier";
        await (0, casier_1.handleCommand)(interaction);
        const replyArg = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(replyArg.embeds[0].data.title).toContain("Casier");
        (0, vitest_1.expect)(replyArg.embeds[0].data.description).toContain("casier vierge");
    });
    (0, vitest_1.it)("should show sanctions in embeds when they exist", async () => {
        const warns = [{ id: 1, type: "WARN", reason: "Test warn", moderatorId: "mod-1", createdAt: new Date() }];
        mockPrisma.sanction.findMany.mockResolvedValueOnce(warns);
        mockPrisma.sanction.findMany.mockResolvedValueOnce([]);
        mockPrisma.sanction.findMany.mockResolvedValueOnce([]);
        mockPrisma.sanction.findMany.mockResolvedValueOnce([]);
        mockPrisma.log.findMany.mockResolvedValue([]);
        const interaction = mockInteraction();
        interaction.commandName = "casier";
        await (0, casier_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            embeds: vitest_1.expect.arrayContaining([
                vitest_1.expect.objectContaining({
                    data: vitest_1.expect.objectContaining({
                        description: vitest_1.expect.stringContaining("Test warn"),
                    }),
                }),
            ]),
        }));
    });
    (0, vitest_1.it)("should error when no guildId", async () => {
        const interaction = mockInteraction({ guildId: null });
        interaction.commandName = "casier";
        await (0, casier_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ content: vitest_1.expect.stringContaining("serveur") }));
    });
});
//# sourceMappingURL=casier.test.js.map