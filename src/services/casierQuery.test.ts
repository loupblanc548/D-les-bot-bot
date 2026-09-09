import { describe, it, expect } from "vitest";
import {
  mergeCasierItems,
  formatCasierForAgent,
  formatDurationSeconds,
  formatGuildSanctionLog,
  labelCasierType,
  escapeMarkdownTableCell,
  formatCasierTable,
} from "./casierQuery.js";

describe("formatDurationSeconds", () => {
  it("formats seconds to a short French label", () => {
    expect(formatDurationSeconds(45)).toBe("45s");
    expect(formatDurationSeconds(1800)).toBe("30 min");
    expect(formatDurationSeconds(7200)).toBe("2 h");
    expect(formatDurationSeconds(null)).toBeNull();
  });
});

describe("mergeCasierItems", () => {
  it("keeps sanctions and drops logs that duplicate a sanction within 60s", () => {
    const at = new Date("2026-09-08T12:00:00Z");
    const items = mergeCasierItems(
      [
        {
          type: "BAN",
          reason: "Raid",
          createdAt: at,
          moderatorId: "mod1",
          duration: null,
        },
      ],
      [
        {
          type: "ban",
          action: "User a ete banni",
          details: "Raid",
          createdAt: new Date(at.getTime() + 2000),
          moderator: "mod1",
        },
        {
          type: "kick",
          action: "Expulsé plus tôt",
          createdAt: new Date("2026-08-01T10:00:00Z"),
          moderator: "mod2",
        },
      ],
    );
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe("BAN");
    expect(items[0].source).toBe("sanction");
    expect(items[1].type).toBe("kick");
    expect(items[1].source).toBe("log");
  });
});

describe("formatCasierForAgent", () => {
  it("says the casier is empty", () => {
    const text = formatCasierForAgent({
      userId: "u1",
      guildId: "g1",
      items: [],
      riskScore: 0,
      riskLevel: "INCONNU",
      underWatch: false,
    });
    expect(text).toMatch(/Casier vierge/);
    expect(text).toContain("<@u1>");
  });

  it("tells the model a Discord card was posted instead of dumping markdown pipes", () => {
    const text = formatCasierForAgent({
      userId: "u1",
      guildId: "g1",
      items: [
        {
          source: "sanction",
          type: "TIMEOUT",
          reason: "Spam",
          date: new Date("2026-09-08T12:00:00Z"),
          moderatorId: "AI_AGENT",
          duration: 1800,
        },
      ],
      riskScore: 15,
      riskLevel: "FAIBLE",
      underWatch: false,
    });
    expect(text).not.toMatch(/\| Date \|/);
    expect(text).toMatch(/Timeout/);
    expect(text).toMatch(/fiche Discord/);
    expect(labelCasierType("BAN")).toBe("Bannissement");
  });
});

describe("formatGuildSanctionLog", () => {
  it("lists server-wide sanctions with the target user", () => {
    const text = formatGuildSanctionLog([
      {
        source: "sanction",
        type: "BAN",
        reason: "Raid",
        date: new Date("2026-09-08T12:00:00Z"),
        moderatorId: "mod1",
        duration: null,
        userId: "u9",
      },
    ]);
    expect(text).toMatch(/Logs de sanctions/);
    expect(text).toMatch(/Bannissement/);
    expect(text).not.toMatch(/\| Date \|/);
    expect(text).toMatch(/fiche Discord/);
  });

  it("says when the guild log is empty", () => {
    expect(formatGuildSanctionLog([])).toMatch(/Aucun log de sanction/);
  });
});

describe("markdown table cells", () => {
  it("strips pipes so a reason cannot break columns", () => {
    expect(escapeMarkdownTableCell("a | b | c")).toBe("a / b / c");
  });

  it("formats French dates instead of Discord timestamp tags", () => {
    const table = formatCasierTable(
      [
        {
          source: "sanction",
          type: "BAN",
          reason: "Raid",
          date: new Date("2026-09-08T12:00:00Z"),
          moderatorId: "mod1",
          duration: null,
          userId: "u9",
        },
      ],
      true,
    );
    expect(table).not.toMatch(/<t:/);
    expect(table).toContain("Raid");
    expect(table).toContain("<@u9>");
  });
});
