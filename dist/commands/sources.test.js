"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ── Mock Prisma (hoisted pattern) ──
const mockPrisma = vitest_1.vi.hoisted(() => ({
    source: {
        create: vitest_1.vi.fn(),
        findFirst: vitest_1.vi.fn(),
        findMany: vitest_1.vi.fn(),
        delete: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("../prisma", () => ({ default: mockPrisma }));
// ── Mock services ──
vitest_1.vi.mock("../services/youtube", () => ({
    resolveYouTubeChannelId: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../services/permissions", () => ({
    requireAdmin: vitest_1.vi.fn(),
}));
const permissions_1 = require("../services/permissions");
const youtube_1 = require("../services/youtube");
// ── Helper : créer une fausse interaction ──
function mockInteraction(overrides = {}) {
    return {
        deferReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        editReply: vitest_1.vi.fn().mockResolvedValue(undefined),
        followUp: vitest_1.vi.fn().mockResolvedValue(undefined),
        reply: vitest_1.vi.fn().mockResolvedValue(undefined),
        options: {
            getString: vitest_1.vi.fn((name) => {
                if (name === "handle")
                    return overrides.handle ?? "@TestUser";
                if (name === "type")
                    return overrides.type ?? "TWITTER";
                return null;
            }),
            getChannel: vitest_1.vi.fn(() => overrides.channel ?? null),
        },
        guildId: overrides.guildId ?? "123456789",
        channelId: overrides.channelId ?? "987654321",
        commandName: overrides.commandName ?? "addsource",
        ...overrides,
    };
}
// ── Regular import (vi.mock is hoisted so mocks apply) ──
const sources_1 = require("../commands/sources");
// ═══════════════════════════════════════════════════════════════
// handleAddSource
// ═══════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handleAddSource", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(permissions_1.requireAdmin).mockResolvedValue(true);
        vitest_1.vi.mocked(youtube_1.resolveYouTubeChannelId).mockResolvedValue(null);
    });
    (0, vitest_1.it)("doit intercepter l'erreur P2002 et renvoyer un message 'déjà enregistré'", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", type: "TWITTER" });
        const p2002Error = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        mockPrisma.source.create.mockRejectedValue(p2002Error);
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        (0, vitest_1.expect)(mockPrisma.source.create).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editReplyCall.content).toContain("déjà enregistré");
        (0, vitest_1.expect)(editReplyCall.content).toContain("@TestUser");
    });
    (0, vitest_1.it)("doit renvoyer un message de succès quand l'insertion réussit", async () => {
        const interaction = mockInteraction({ handle: "@NewSource", type: "TWITTER" });
        mockPrisma.source.create.mockResolvedValue({ id: 1 });
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editReplyCall.embeds).toBeDefined();
        (0, vitest_1.expect)(editReplyCall.embeds[0].data.title).toContain("Source");
        (0, vitest_1.expect)(editReplyCall.embeds[0].data.description).toContain("@NewSource");
    });
    (0, vitest_1.it)("doit renvoyer l'erreur au catch global si l'erreur Prisma n'est pas un P2002", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", type: "TWITTER" });
        mockPrisma.source.create.mockRejectedValue(new Error("Connection timeout"));
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
        const errorCall = interaction.editReply.mock.calls.find((call) => call[0]?.content?.includes("Impossible d'ajouter"));
        (0, vitest_1.expect)(errorCall).toBeDefined();
    });
    (0, vitest_1.it)("ne doit pas appeler create si requireAdmin retourne false", async () => {
        const interaction = mockInteraction({ handle: "@TestUser" });
        vitest_1.vi.mocked(permissions_1.requireAdmin).mockResolvedValue(false);
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.source.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("doit résoudre l'ID YouTube avant d'insérer pour une source YOUTUBE", async () => {
        const interaction = mockInteraction({ handle: "@YTChannel", type: "YOUTUBE" });
        vitest_1.vi.mocked(youtube_1.resolveYouTubeChannelId).mockResolvedValue("UC123456789");
        mockPrisma.source.create.mockResolvedValue({ id: 2 });
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(mockPrisma.source.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({
                urlOrHandle: "UC123456789",
                type: "YOUTUBE",
            }),
        }));
    });
    (0, vitest_1.it)("doit renvoyer un embed d'erreur quand resolveYouTubeChannelId retourne null (chaîne introuvable)", async () => {
        const interaction = mockInteraction({ handle: "@Cha\u00EEneInconnue", type: "YOUTUBE" });
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        (0, vitest_1.expect)(mockPrisma.source.create).not.toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editReplyCall.embeds).toBeDefined();
        (0, vitest_1.expect)(editReplyCall.embeds).toHaveLength(1);
        const errorEmbed = editReplyCall.embeds[0];
        (0, vitest_1.expect)(errorEmbed.data.title).toContain("introuvable");
        (0, vitest_1.expect)(errorEmbed.data.description).toContain("@Cha\u00EEneInconnue");
        (0, vitest_1.expect)(errorEmbed.data.description).toContain("@MrBeast");
        (0, vitest_1.expect)(errorEmbed.data.color).toBe(0xff3344);
    });
});
// ═══════════════════════════════════════════════════════════════
// handleRemoveSource
// ═══════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handleRemoveSource", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(permissions_1.requireAdmin).mockResolvedValue(true);
    });
    (0, vitest_1.it)("doit supprimer la source et renvoyer un message de succès", async () => {
        const interaction = mockInteraction({ handle: "@SourceASupprimer", commandName: "removesource" });
        mockPrisma.source.findFirst.mockResolvedValue({ id: 42, urlOrHandle: "@SourceASupprimer" });
        mockPrisma.source.delete.mockResolvedValue(undefined);
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        // La recherche doit utiliser le handle sans @
        (0, vitest_1.expect)(mockPrisma.source.findFirst).toHaveBeenCalledWith({
            where: { guildId: "123456789", OR: [{ urlOrHandle: "SourceASupprimer" }, { urlOrHandle: "@SourceASupprimer" }] },
        });
        (0, vitest_1.expect)(mockPrisma.source.delete).toHaveBeenCalledWith({ where: { id: 42 } });
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editReplyCall.content).toContain("supprimé des sources");
        (0, vitest_1.expect)(editReplyCall.content).toContain("@SourceASupprimer");
    });
    (0, vitest_1.it)("doit renvoyer un message si la source n'est pas trouvée", async () => {
        const interaction = mockInteraction({ handle: "@Inexistant", commandName: "removesource" });
        mockPrisma.source.findFirst.mockResolvedValue(null);
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        (0, vitest_1.expect)(mockPrisma.source.delete).not.toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editReplyCall.content).toContain("n'est pas dans les sources");
        (0, vitest_1.expect)(editReplyCall.content).toContain("@Inexistant");
    });
    (0, vitest_1.it)("ne doit pas appeler findFirst si requireAdmin retourne false", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", commandName: "removesource" });
        vitest_1.vi.mocked(permissions_1.requireAdmin).mockResolvedValue(false);
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.source.findFirst).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.source.delete).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("doit renvoyer l'erreur au catch global si delete échoue après findFirst", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", commandName: "removesource" });
        mockPrisma.source.findFirst.mockResolvedValue({ id: 42, urlOrHandle: "@TestUser" });
        mockPrisma.source.delete.mockRejectedValue(new Error("Delete forbidden"));
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        (0, vitest_1.expect)(mockPrisma.source.delete).toHaveBeenCalledWith({ where: { id: 42 } });
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
        const errorCall = interaction.editReply.mock.calls.find((call) => call[0]?.content?.includes("Impossible de supprimer"));
        (0, vitest_1.expect)(errorCall).toBeDefined();
    });
    (0, vitest_1.it)("doit renvoyer l'erreur au catch global si findFirst échoue", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", commandName: "removesource" });
        mockPrisma.source.findFirst.mockRejectedValue(new Error("DB down"));
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
        const errorCall = interaction.editReply.mock.calls.find((call) => call[0]?.content?.includes("Impossible de supprimer"));
        (0, vitest_1.expect)(errorCall).toBeDefined();
    });
});
// ═══════════════════════════════════════════════════════════════
// handleListSources
// ═══════════════════════════════════════════════════════════════
(0, vitest_1.describe)("handleListSources", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("doit afficher un embed vide quand aucune source n'est configurée", async () => {
        const interaction = mockInteraction({ commandName: "listsources" });
        mockPrisma.source.findMany.mockResolvedValue([]);
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        (0, vitest_1.expect)(mockPrisma.source.findMany).toHaveBeenCalledWith({ where: { guildId: "123456789" } });
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editReplyCall.embeds).toBeDefined();
        (0, vitest_1.expect)(editReplyCall.embeds).toHaveLength(1);
        const embed = editReplyCall.embeds[0];
        (0, vitest_1.expect)(embed.data.description).toContain("Aucune source configurée");
        (0, vitest_1.expect)(embed.data.fields || []).toHaveLength(0);
    });
    (0, vitest_1.it)("doit afficher les sources groupées par type (YouTube, Twitter, Autres)", async () => {
        const interaction = mockInteraction({ commandName: "listsources" });
        mockPrisma.source.findMany.mockResolvedValue([
            { id: 1, type: "YOUTUBE", urlOrHandle: "UC123" },
            { id: 2, type: "YOUTUBE", urlOrHandle: "@MrBeast" },
            { id: 3, type: "TWITTER", urlOrHandle: "@TwitterUser" },
            { id: 4, type: "BLUESKY", urlOrHandle: "@bsky.bsky.social" },
        ]);
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(editReplyCall.embeds).toBeDefined();
        const embed = editReplyCall.embeds[0];
        // Titre de l'embed
        (0, vitest_1.expect)(embed.data.title).toContain("Sources surveillées");
        // 3 champs : YouTube, Twitter/X, Autres
        (0, vitest_1.expect)(embed.data.fields).toHaveLength(3);
        // YouTube : UC... sont wrappés en backticks, les handles non-UC non
        const ytField = embed.data.fields.find((f) => f.name === "YouTube");
        (0, vitest_1.expect)(ytField).toBeDefined();
        (0, vitest_1.expect)(ytField.value).toContain("UC123");
        (0, vitest_1.expect)(ytField.value).toContain("@MrBeast");
        // Twitter
        const twField = embed.data.fields.find((f) => f.name === "Twitter/X");
        (0, vitest_1.expect)(twField).toBeDefined();
        (0, vitest_1.expect)(twField.value).toContain("@TwitterUser");
        // Autres (Bluesky)
        const otherField = embed.data.fields.find((f) => f.name === "Autres");
        (0, vitest_1.expect)(otherField).toBeDefined();
        (0, vitest_1.expect)(otherField.value).toContain("BLUESKY");
        (0, vitest_1.expect)(otherField.value).toContain("@bsky.bsky.social");
    });
    (0, vitest_1.it)("doit renvoyer l'erreur au catch global si findMany échoue", async () => {
        const interaction = mockInteraction({ commandName: "listsources" });
        mockPrisma.source.findMany.mockRejectedValue(new Error("DB timeout"));
        await (0, sources_1.handleCommand)(interaction);
        (0, vitest_1.expect)(interaction.editReply).toHaveBeenCalled();
        const errorCall = interaction.editReply.mock.calls.find((call) => call[0]?.content?.includes("Impossible de lister"));
        (0, vitest_1.expect)(errorCall).toBeDefined();
    });
});
//# sourceMappingURL=sources.test.js.map