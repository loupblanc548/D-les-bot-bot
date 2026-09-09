import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    sanction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    log: { findMany: vi.fn() },
    riskProfile: { findUnique: vi.fn() },
  },
}));

vi.mock("../prisma", () => ({ default: mockPrisma }));
vi.mock("../services/permissions", () => ({
  requireMod: vi.fn().mockResolvedValue(true),
  requireAdmin: vi.fn().mockResolvedValue(true),
}));

import { buildCasierSlashPages, buildNavRow, handleCommand, handleCasierClear } from "./casier.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { CasierItem } from "../services/casierQuery.js";

function mockUser(id: string, tag: string) {
  return {
    id,
    tag,
    username: tag.split("#")[0],
    displayName: tag,
    toString: () => "<@" + id + ">",
  } as any;
}
function mockInteraction(overrides: any = {}) {
  return {
    options: {
      getUser: vi.fn().mockReturnValue(overrides.user ?? mockUser("target-1", "Target#1234")),
      getInteger: vi.fn().mockReturnValue(overrides.integerId ?? null),
      getString: vi.fn(),
    },
    user: overrides.caller ?? mockUser("mod-1", "Mod#0001"),
    guildId: "guildId" in overrides ? overrides.guildId : "guild-1",
    member: overrides.member ?? null,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

function item(partial: Partial<CasierItem> = {}): CasierItem {
  return {
    source: "sanction",
    type: "WARN",
    reason: "Spam en chat",
    date: new Date("2026-09-08T12:00:00Z"),
    moderatorId: "mod-1",
    duration: null,
    userId: "target-1",
    ...partial,
  };
}

describe("buildCasierSlashPages", () => {
  it("renders a markdown table with date, type, reason and moderator", () => {
    const pages = buildCasierSlashPages({
      username: "Target",
      userId: "target-1",
      items: [item()],
      riskScore: 12,
      riskLevel: "FAIBLE",
      underWatch: false,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatch(/\| Date \| Type \| Durée \| Raison \| Par \|/);
    expect(pages[0]).toContain("Spam en chat");
    expect(pages[0]).toContain("<@mod-1>");
    expect(pages[0]).toContain("⚠️");
    expect(pages[0]).toContain("1 entrée");
  });

  it("includes duration in its own column", () => {
    const pages = buildCasierSlashPages({
      username: "Target",
      userId: "target-1",
      items: [item({ type: "TIMEOUT", reason: "Flood", duration: 3600, moderatorId: "mod-2" })],
      riskScore: 20,
      riskLevel: "MOYEN",
      underWatch: true,
    });
    expect(pages[0]).toMatch(/1 h/);
    expect(pages[0]).toMatch(/Timeout/);
    expect(pages[0]).toMatch(/Surveillance \*\*oui\*\*/);
  });

  it("paginates when many rows would overflow Discord content", () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      item({
        reason: `Motif très long pour forcer la pagination numéro ${i} `.repeat(3),
        moderatorId: `mod-${i}`,
      }),
    );
    const pages = buildCasierSlashPages({
      username: "Target",
      userId: "target-1",
      items,
      riskScore: 40,
      riskLevel: "ELEVE",
      underWatch: false,
    });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(2000);
      expect(page).toMatch(/\| Date \| Type \|/);
    }
  });
});

describe("buildNavRow", () => {
  it("should return an ActionRow with buttons", () => {
    expect(buildNavRow(0, 3).components.length).toBe(3);
  });
  it("should disable prev button on first page", () => {
    expect(buildNavRow(0, 3).components[0].data.disabled).toBe(true);
  });
  it("should disable next button on last page", () => {
    expect(buildNavRow(2, 3).components[2].data.disabled).toBe(true);
  });
  it("should enable both buttons on middle page", () => {
    const row = buildNavRow(1, 3);
    expect(row.components[0].data.disabled).toBe(false);
    expect(row.components[2].data.disabled).toBe(false);
  });
});

describe("handleCasierClear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reply error when called without id or member", async () => {
    const interaction = mockInteraction();
    (interaction.options.getInteger as any).mockReturnValue(null);
    (interaction.options.getUser as any).mockReturnValue(null);
    await handleCasierClear(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Fournis un ID de sanction") }),
    );
  });

  it("should delete a sanction by ID and reply success", async () => {
    mockPrisma.sanction.findUnique.mockResolvedValue({ id: 5, type: "WARN" });
    mockPrisma.sanction.delete.mockResolvedValue({});
    const interaction = mockInteraction({ integerId: 5 });
    await handleCasierClear(interaction);
    expect(mockPrisma.sanction.findUnique).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(mockPrisma.sanction.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Sanction #5") }),
    );
  });

  it("should reply error when sanction ID not found", async () => {
    mockPrisma.sanction.findUnique.mockResolvedValue(null);
    const interaction = mockInteraction({ integerId: 999 });
    await handleCasierClear(interaction);
    expect(mockPrisma.sanction.findUnique).toHaveBeenCalledWith({ where: { id: 999 } });
    expect(mockPrisma.sanction.delete).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("introuvable") }),
    );
  });

  it("should delete all sanctions for a member", async () => {
    mockPrisma.sanction.deleteMany.mockResolvedValue({ count: 3 });
    const membre = mockUser("user-99", "BadUser#9999");
    const interaction = mockInteraction({ user: membre });
    (interaction.options.getInteger as any).mockReturnValue(null);
    await handleCasierClear(interaction);
    expect(mockPrisma.sanction.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-99" }) }),
    );
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("3 sanction(s)") }),
    );
  });
});

describe("handleCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.riskProfile.findUnique.mockResolvedValue(null);
    mockPrisma.log.findMany.mockResolvedValue([]);
  });

  it("should query sanctions and logs for the target user", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([]);
    const interaction = mockInteraction();
    interaction.commandName = "casier";
    await handleCommand(interaction);
    expect(mockPrisma.sanction.findMany).toHaveBeenCalled();
    expect(mockPrisma.log.findMany).toHaveBeenCalled();
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it("should show vierge embed when no sanctions exist", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([]);
    const interaction = mockInteraction();
    interaction.commandName = "casier";
    await handleCommand(interaction);
    const replyArg = (interaction.editReply as any).mock.calls[0][0];
    expect(replyArg.embeds[0].data.title).toContain("Casier");
    expect(replyArg.embeds[0].data.description).toMatch(/casier vierge/i);
  });

  it("should show sanctions in a markdown table", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([
      { id: 1, type: "WARN", reason: "Test warn", moderatorId: "mod-1", createdAt: new Date() },
    ]);
    const interaction = mockInteraction();
    interaction.commandName = "casier";
    await handleCommand(interaction);
    const replyArg = (interaction.editReply as any).mock.calls[0][0];
    expect(replyArg.content).toContain("Test warn");
    expect(replyArg.content).toMatch(/\| Date \| Type \| Durée \| Raison \| Par \|/);
    expect(replyArg.embeds[0].data.title).toContain("Casier");
  });

  it("should error when no guildId", async () => {
    const interaction = mockInteraction({ guildId: null });
    interaction.commandName = "casier";
    await handleCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("serveur") }),
    );
  });
});
