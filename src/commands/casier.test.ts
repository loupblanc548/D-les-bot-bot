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
  },
}));

vi.mock("../prisma", () => ({ default: mockPrisma }));
vi.mock("../services/permissions", () => ({ requireMod: vi.fn().mockResolvedValue(true), requireAdmin: vi.fn().mockResolvedValue(true) }));

import { buildEntries, chunkEntries, buildNavRow, handleCommand, handleCasierClear } from "./casier.js";
import type { CasierEntry } from "./casier.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";

function mockUser(id: string, tag: string) {
  return { id, tag, username: tag.split("#")[0], displayName: tag, toString: () => "<@" + id + ">" } as any;
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

describe("buildEntries", () => {
  it("should return an empty array when no sanctions exist", () => {
    expect(buildEntries([], [], [], [], [])).toEqual([]);
  });

  it("should group warnings under a WARN header", () => {
    const warns = [{ id: 1, type: "WARN", reason: "Spam en chat", moderatorId: "mod-1", createdAt: new Date("2025-01-15") }];
    const entries = buildEntries(warns, [], [], [], []);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.find((e: any) => e.isHeader)?.headerLine).toContain("Avertissements");
    expect(entries.some((e: any) => !e.isHeader && e.line.includes("Spam en chat"))).toBe(true);
  });

  it("should group mutes under a TIMEOUT header", () => {
    const createdAt = new Date("2025-02-20");
    const mutes = [{ id: 2, type: "TIMEOUT", reason: "Flood", moderatorId: "mod-2", createdAt, duration: 3600, endTime: new Date(createdAt.getTime() + 3600 * 1000) }];
    const entries = buildEntries([], mutes, [], [], []);
    expect(entries.find((e: any) => e.isHeader)?.headerLine).toContain("Exclusions temporaires");
    expect(entries.some((e: any) => !e.isHeader && e.line.includes("60 min"))).toBe(true);
  });

  it("should group kicks under a KICK header", () => {
    const kicks = [{ id: 3, type: "KICK", reason: "Insultes", moderatorId: "mod-3", createdAt: new Date("2025-03-10"), duration: null }];
    const entries = buildEntries([], [], kicks, [], []);
    expect(entries.find((e: any) => e.isHeader)?.headerLine).toContain("Expulsions");
    expect(entries.some((e: any) => !e.isHeader && e.line.includes("Insultes"))).toBe(true);
  });

  it("should include ban sanctions under a BAN header", () => {
    const bans = [{ id: 4, type: "BAN", reason: "Raid", moderatorId: "mod-4", createdAt: new Date("2025-04-01"), duration: null }];
    const entries = buildEntries([], [], [], bans, []);
    expect(entries.find((e: any) => e.isHeader)?.headerLine).toContain("Bannissements");
  });

  it("should include log-based bans", () => {
    const logs = [{ id: "log-1", type: "BAN", action: "BAN", targetId: "target-1", details: "Banni pour comportement toxique", moderator: "mod-5", createdAt: new Date("2025-05-01") }];
    const entries = buildEntries([], [], [], [], logs);
    expect(entries.some((e: any) => !e.isHeader && e.line.includes("BAN"))).toBe(true);
  });

  it("should include the sanction ID in entries", () => {
    const warns = [{ id: 42, type: "WARN", reason: "Test", moderatorId: "mod-1", createdAt: new Date() }];
    const entries = buildEntries(warns, [], [], [], []);
    expect(entries.some((e: any) => !e.isHeader && e.line.includes("#1"))).toBe(true);
  });

  it("should include moderator mention in entries", () => {
    const warns = [{ id: 1, type: "WARN", reason: "Test", moderatorId: "mod-99", createdAt: new Date() }];
    const entries = buildEntries(warns, [], [], [], []);
    expect(entries.some((e: any) => !e.isHeader && e.line.includes("mod-99"))).toBe(true);
  });

  it("should format duration in minutes", () => {
    const now = new Date();
    const mutes = [{ id: 5, type: "TIMEOUT", reason: "Spam", moderatorId: "mod-1", createdAt: now, duration: 7200, endTime: new Date(now.getTime() + 7200 * 1000) }];
    const entries = buildEntries([], mutes, [], [], []);
    expect(entries.some((e: any) => !e.isHeader && e.line.includes("120 min"))).toBe(true);
  });

  it("should handle multiple sections in order", () => {
    const now = new Date();
    const warns = [{ id: 1, type: "WARN", reason: "W1", moderatorId: "m1", createdAt: now }];
    const mutes = [{ id: 2, type: "TIMEOUT", reason: "M1", moderatorId: "m2", createdAt: now, duration: 600, endTime: new Date(now.getTime() + 600 * 1000) }];
    const kicks = [{ id: 3, type: "KICK", reason: "K1", moderatorId: "m3", createdAt: now, duration: null }];
    const bans = [{ id: 4, type: "BAN", reason: "B1", moderatorId: "m4", createdAt: now, duration: null }];
    const entries = buildEntries(warns, mutes, kicks, bans, []);
    const headers = entries.filter((e: any) => e.isHeader);
    expect(headers.length).toBeGreaterThanOrEqual(4);
    const headerTexts = headers.map((h: any) => h.headerLine);
    expect(headerTexts.some((h: string) => h.includes("Avertissements"))).toBe(true);
    expect(headerTexts.some((h: string) => h.includes("Exclusions temporaires"))).toBe(true);
    expect(headerTexts.some((h: string) => h.includes("Expulsions"))).toBe(true);
    expect(headerTexts.some((h: string) => h.includes("Bannissements"))).toBe(true);
  });
});

describe("chunkEntries", () => {
  it("should return a single page for small content", () => {
    const entries: CasierEntry[] = [
      { section: "warn", isHeader: true, headerLine: "AVERTISSEMENTS (1)", line: "AVERTISSEMENTS (1)" },
      { section: "warn", isHeader: false, headerLine: "AVERTISSEMENTS (1)", line: ".. #1 .. Spam .. <@mod-1> .. 15/01/2025" },
    ];
    expect(chunkEntries(entries, 3800).length).toBe(1);
  });

  it("should split large content into multiple pages", () => {
    const entries: CasierEntry[] = [];
    entries.push({ section: "warn", isHeader: true, headerLine: "AVERTISSEMENTS (200)", line: "AVERTISSEMENTS (200)" });
    for (let i = 0; i < 200; i++) {
      entries.push({ section: "warn", isHeader: false, headerLine: "AVERTISSEMENTS (200)", line: ".. #" + i + " .. Reason number " + i + " for testing pagination .. <@mod-" + i + "> .. 01/01/2025" });
    }
    const pages = chunkEntries(entries, 3800);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(4096);
  });

  it("should handle empty entries", () => {
    expect(chunkEntries([], 3800)).toEqual([""]);
  });

  it("should keep entries intact within a page", () => {
    const entries: CasierEntry[] = [
      { section: "warn", isHeader: true, headerLine: "TEST", line: "TEST" },
      { section: "warn", isHeader: false, headerLine: "TEST", line: "Line 1" },
      { section: "warn", isHeader: false, headerLine: "TEST", line: "Line 2" },
      { section: "warn", isHeader: false, headerLine: "TEST", line: "Line 3" },
    ];
    const pages = chunkEntries(entries, 3800);
    expect(pages[0]).toContain("TEST");
    expect(pages[0]).toContain("Line 1");
    expect(pages[0]).toContain("Line 2");
    expect(pages[0]).toContain("Line 3");
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
      expect.objectContaining({ content: expect.stringContaining("Fournis un ID de sanction") })
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
      expect.objectContaining({ content: expect.stringContaining("Sanction #5") })
    );
  });

  it("should reply error when sanction ID not found", async () => {
    mockPrisma.sanction.findUnique.mockResolvedValue(null);
    const interaction = mockInteraction({ integerId: 999 });
    await handleCasierClear(interaction);
    expect(mockPrisma.sanction.findUnique).toHaveBeenCalledWith({ where: { id: 999 } });
    expect(mockPrisma.sanction.delete).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("introuvable") })
    );
  });

  it("should delete all sanctions for a member", async () => {
    mockPrisma.sanction.deleteMany.mockResolvedValue({ count: 3 });
    const membre = mockUser("user-99", "BadUser#9999");
    const interaction = mockInteraction({ user: membre });
    (interaction.options.getInteger as any).mockReturnValue(null);
    await handleCasierClear(interaction);
    expect(mockPrisma.sanction.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-99" }) })
    );
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("3 sanction(s)") })
    );
  });
});

describe("handleCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should query sanctions and logs for the target user", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([]);
    mockPrisma.log.findMany.mockResolvedValue([]);
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
    mockPrisma.log.findMany.mockResolvedValue([]);
    const interaction = mockInteraction();
    interaction.commandName = "casier";
    await handleCommand(interaction);
    const replyArg = (interaction.editReply as any).mock.calls[0][0];
    expect(replyArg.embeds[0].data.title).toContain("Casier");
    expect(replyArg.embeds[0].data.description).toContain("casier vierge");
  });

  it("should show sanctions in embeds when they exist", async () => {
    const warns = [{ id: 1, type: "WARN", reason: "Test warn", moderatorId: "mod-1", createdAt: new Date() }];
    mockPrisma.sanction.findMany.mockResolvedValueOnce(warns);
    mockPrisma.sanction.findMany.mockResolvedValueOnce([]);
    mockPrisma.sanction.findMany.mockResolvedValueOnce([]);
    mockPrisma.sanction.findMany.mockResolvedValueOnce([]);
    mockPrisma.log.findMany.mockResolvedValue([]);
    const interaction = mockInteraction();
    interaction.commandName = "casier";
    await handleCommand(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining("Test warn"),
            }),
          }),
        ]),
      })
    );
  });

  it("should error when no guildId", async () => {
    const interaction = mockInteraction({ guildId: null });
    interaction.commandName = "casier";
    await handleCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("serveur") })
    );
  });
});
