import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mock Prisma (hoisted pattern) ──
const mockPrisma = vi.hoisted(() => ({
    source: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
    },
}));
vi.mock("../prisma", () => ({ default: mockPrisma }));
// ── Mock services ──
vi.mock("../services/youtube", () => ({
    resolveYouTubeChannelId: vi.fn(),
}));
vi.mock("../services/permissions", () => ({
    requireAdmin: vi.fn(),
}));
import { requireAdmin } from "../services/permissions.js";
import { resolveYouTubeChannelId } from "../services/youtube.js";
// ── Helper : créer une fausse interaction ──
function mockInteraction(overrides = {}) {
    return {
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        followUp: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        options: {
            getString: vi.fn((name) => {
                if (name === "handle")
                    return overrides.handle ?? "@TestUser";
                if (name === "type")
                    return overrides.type ?? "TWITTER";
                return null;
            }),
            getChannel: vi.fn(() => overrides.channel ?? null),
        },
        guildId: overrides.guildId ?? "123456789",
        channelId: overrides.channelId ?? "987654321",
        commandName: overrides.commandName ?? "addsource",
        ...overrides,
    };
}
// ── Regular import (vi.mock is hoisted so mocks apply) ──
import { handleCommand } from "../commands/sources.js";
// ═══════════════════════════════════════════════════════════════
// handleAddSource
// ═══════════════════════════════════════════════════════════════
describe("handleAddSource", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue(true);
        vi.mocked(resolveYouTubeChannelId).mockResolvedValue(null);
    });
    it("doit intercepter l'erreur P2002 et renvoyer un message 'déjà enregistré'", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", type: "TWITTER" });
        const p2002Error = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        mockPrisma.source.create.mockRejectedValue(p2002Error);
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(mockPrisma.source.create).toHaveBeenCalledTimes(1);
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        expect(editReplyCall.content).toContain("déjà enregistré");
        expect(editReplyCall.content).toContain("@TestUser");
    });
    it("doit renvoyer un message de succès quand l'insertion réussit", async () => {
        const interaction = mockInteraction({ handle: "@NewSource", type: "TWITTER" });
        mockPrisma.source.create.mockResolvedValue({ id: 1 });
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        expect(editReplyCall.embeds).toBeDefined();
        expect(editReplyCall.embeds[0].data.title).toContain("Source");
        expect(editReplyCall.embeds[0].data.description).toContain("@NewSource");
    });
    it("doit renvoyer l'erreur au catch global si l'erreur Prisma n'est pas un P2002", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", type: "TWITTER" });
        mockPrisma.source.create.mockRejectedValue(new Error("Connection timeout"));
        await handleCommand(interaction);
        expect(interaction.editReply).toHaveBeenCalled();
        const errorCall = interaction.editReply.mock.calls.find((call) => call[0]?.content?.includes("Impossible d'ajouter"));
        expect(errorCall).toBeDefined();
    });
    it("ne doit pas appeler create si requireAdmin retourne false", async () => {
        const interaction = mockInteraction({ handle: "@TestUser" });
        vi.mocked(requireAdmin).mockResolvedValue(false);
        await handleCommand(interaction);
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(mockPrisma.source.create).not.toHaveBeenCalled();
    });
    it("doit résoudre l'ID YouTube avant d'insérer pour une source YOUTUBE", async () => {
        const interaction = mockInteraction({ handle: "@YTChannel", type: "YOUTUBE" });
        vi.mocked(resolveYouTubeChannelId).mockResolvedValue("UC123456789");
        mockPrisma.source.create.mockResolvedValue({ id: 2 });
        await handleCommand(interaction);
        expect(mockPrisma.source.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                urlOrHandle: "UC123456789",
                type: "YOUTUBE",
            }),
        }));
    });
    it("doit renvoyer un embed d'erreur quand resolveYouTubeChannelId retourne null (chaîne introuvable)", async () => {
        const interaction = mockInteraction({ handle: "@Cha\u00EEneInconnue", type: "YOUTUBE" });
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(mockPrisma.source.create).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        expect(editReplyCall.embeds).toBeDefined();
        expect(editReplyCall.embeds).toHaveLength(1);
        const errorEmbed = editReplyCall.embeds[0];
        expect(errorEmbed.data.title).toContain("introuvable");
        expect(errorEmbed.data.description).toContain("@Cha\u00EEneInconnue");
        expect(errorEmbed.data.description).toContain("@MrBeast");
        expect(errorEmbed.data.color).toBe(0xff3344);
    });
});
// ═══════════════════════════════════════════════════════════════
// handleRemoveSource
// ═══════════════════════════════════════════════════════════════
describe("handleRemoveSource", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue(true);
    });
    it("doit supprimer la source et renvoyer un message de succès", async () => {
        const interaction = mockInteraction({ handle: "@SourceASupprimer", commandName: "removesource" });
        mockPrisma.source.findFirst.mockResolvedValue({ id: 42, urlOrHandle: "@SourceASupprimer" });
        mockPrisma.source.delete.mockResolvedValue(undefined);
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        // La recherche doit utiliser le handle sans @
        expect(mockPrisma.source.findFirst).toHaveBeenCalledWith({
            where: { guildId: "123456789", OR: [{ urlOrHandle: "SourceASupprimer" }, { urlOrHandle: "@SourceASupprimer" }] },
        });
        expect(mockPrisma.source.delete).toHaveBeenCalledWith({ where: { id: 42 } });
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        expect(editReplyCall.content).toContain("supprimé des sources");
        expect(editReplyCall.content).toContain("@SourceASupprimer");
    });
    it("doit renvoyer un message si la source n'est pas trouvée", async () => {
        const interaction = mockInteraction({ handle: "@Inexistant", commandName: "removesource" });
        mockPrisma.source.findFirst.mockResolvedValue(null);
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(mockPrisma.source.delete).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        expect(editReplyCall.content).toContain("n'est pas dans les sources");
        expect(editReplyCall.content).toContain("@Inexistant");
    });
    it("ne doit pas appeler findFirst si requireAdmin retourne false", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", commandName: "removesource" });
        vi.mocked(requireAdmin).mockResolvedValue(false);
        await handleCommand(interaction);
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(mockPrisma.source.findFirst).not.toHaveBeenCalled();
        expect(mockPrisma.source.delete).not.toHaveBeenCalled();
    });
    it("doit renvoyer l'erreur au catch global si delete échoue après findFirst", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", commandName: "removesource" });
        mockPrisma.source.findFirst.mockResolvedValue({ id: 42, urlOrHandle: "@TestUser" });
        mockPrisma.source.delete.mockRejectedValue(new Error("Delete forbidden"));
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(mockPrisma.source.delete).toHaveBeenCalledWith({ where: { id: 42 } });
        expect(interaction.editReply).toHaveBeenCalled();
        const errorCall = interaction.editReply.mock.calls.find((call) => call[0]?.content?.includes("Impossible de supprimer"));
        expect(errorCall).toBeDefined();
    });
    it("doit renvoyer l'erreur au catch global si findFirst échoue", async () => {
        const interaction = mockInteraction({ handle: "@TestUser", commandName: "removesource" });
        mockPrisma.source.findFirst.mockRejectedValue(new Error("DB down"));
        await handleCommand(interaction);
        expect(interaction.editReply).toHaveBeenCalled();
        const errorCall = interaction.editReply.mock.calls.find((call) => call[0]?.content?.includes("Impossible de supprimer"));
        expect(errorCall).toBeDefined();
    });
});
// ═══════════════════════════════════════════════════════════════
// handleListSources
// ═══════════════════════════════════════════════════════════════
describe("handleListSources", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("doit afficher un embed vide quand aucune source n'est configurée", async () => {
        const interaction = mockInteraction({ commandName: "listsources" });
        mockPrisma.source.findMany.mockResolvedValue([]);
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(mockPrisma.source.findMany).toHaveBeenCalledWith({ where: { guildId: "123456789" } });
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        expect(editReplyCall.embeds).toBeDefined();
        expect(editReplyCall.embeds).toHaveLength(1);
        const embed = editReplyCall.embeds[0];
        expect(embed.data.description).toContain("Aucune source configurée");
        expect(embed.data.fields || []).toHaveLength(0);
    });
    it("doit afficher les sources groupées par type (YouTube, Twitter, Autres)", async () => {
        const interaction = mockInteraction({ commandName: "listsources" });
        mockPrisma.source.findMany.mockResolvedValue([
            { id: 1, type: "YOUTUBE", urlOrHandle: "UC123" },
            { id: 2, type: "YOUTUBE", urlOrHandle: "@MrBeast" },
            { id: 3, type: "TWITTER", urlOrHandle: "@TwitterUser" },
            { id: 4, type: "BLUESKY", urlOrHandle: "@bsky.bsky.social" },
        ]);
        await handleCommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const editReplyCall = interaction.editReply.mock.calls[0][0];
        expect(editReplyCall.embeds).toBeDefined();
        const embed = editReplyCall.embeds[0];
        // Titre de l'embed
        expect(embed.data.title).toContain("Sources surveillées");
        // 3 champs : YouTube, Twitter/X, Autres
        expect(embed.data.fields).toHaveLength(3);
        // YouTube : UC... sont wrappés en backticks, les handles non-UC non
        const ytField = embed.data.fields.find((f) => f.name === "YouTube");
        expect(ytField).toBeDefined();
        expect(ytField.value).toContain("UC123");
        expect(ytField.value).toContain("@MrBeast");
        // Twitter
        const twField = embed.data.fields.find((f) => f.name === "Twitter/X");
        expect(twField).toBeDefined();
        expect(twField.value).toContain("@TwitterUser");
        // Autres (Bluesky)
        const otherField = embed.data.fields.find((f) => f.name === "Autres");
        expect(otherField).toBeDefined();
        expect(otherField.value).toContain("BLUESKY");
        expect(otherField.value).toContain("@bsky.bsky.social");
    });
    it("doit renvoyer l'erreur au catch global si findMany échoue", async () => {
        const interaction = mockInteraction({ commandName: "listsources" });
        mockPrisma.source.findMany.mockRejectedValue(new Error("DB timeout"));
        await handleCommand(interaction);
        expect(interaction.editReply).toHaveBeenCalled();
        const errorCall = interaction.editReply.mock.calls.find((call) => call[0]?.content?.includes("Impossible de lister"));
        expect(errorCall).toBeDefined();
    });
});
//# sourceMappingURL=sources.test.js.map