import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditLogEvent } from "discord.js";

const mockPrisma = vi.hoisted(() => ({
  sanction: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));
const mockRecordSanction = vi.hoisted(() => vi.fn());
const mockCreateLog = vi.hoisted(() => vi.fn());

vi.mock("../prisma.js", () => ({ default: mockPrisma }));
vi.mock("./risk-engine.js", () => ({ recordSanction: mockRecordSanction }));
vi.mock("./logs.js", () => ({ createLog: mockCreateLog }));
vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  mapAuditLogToCasier,
  recordCasierSanction,
  resetCasierDedupForTests,
} from "./casierRecorder.js";

describe("mapAuditLogToCasier", () => {
  it("maps Discord UI ban / kick / unban", () => {
    expect(
      mapAuditLogToCasier({
        action: AuditLogEvent.MemberBanAdd,
        guildId: "g1",
        targetId: "u1",
        executorId: "mod1",
        reason: "Raid",
      }),
    ).toMatchObject({ type: "BAN", userId: "u1", moderatorId: "mod1", reason: "Raid" });

    expect(
      mapAuditLogToCasier({
        action: AuditLogEvent.MemberKick,
        guildId: "g1",
        targetId: "u1",
        executorId: "mod1",
        reason: "Insultes",
      }),
    ).toMatchObject({ type: "KICK", reason: "Insultes" });

    expect(
      mapAuditLogToCasier({
        action: AuditLogEvent.MemberBanRemove,
        guildId: "g1",
        targetId: "u1",
        executorId: "mod1",
      }),
    ).toMatchObject({ type: "UNBAN" });
  });

  it("maps timeout start from MemberUpdate, ignores timeout end", () => {
    const until = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const timeout = mapAuditLogToCasier({
      action: AuditLogEvent.MemberUpdate,
      guildId: "g1",
      targetId: "u1",
      executorId: "mod1",
      reason: "Spam",
      changes: [{ key: "communication_disabled_until", old: null, new: until }],
    });
    expect(timeout?.type).toBe("TIMEOUT");
    expect(timeout?.duration).toBeGreaterThan(500);
    expect(timeout?.duration).toBeLessThan(700);

    expect(
      mapAuditLogToCasier({
        action: AuditLogEvent.MemberUpdate,
        guildId: "g1",
        targetId: "u1",
        executorId: "mod1",
        changes: [{ key: "communication_disabled_until", old: until, new: null }],
      }),
    ).toBeNull();
  });

  it("maps server voice mute, ignores unrelated member updates", () => {
    expect(
      mapAuditLogToCasier({
        action: AuditLogEvent.MemberUpdate,
        guildId: "g1",
        targetId: "u1",
        executorId: "mod1",
        changes: [{ key: "mute", old: false, new: true }],
      }),
    ).toMatchObject({ type: "MUTE" });

    expect(
      mapAuditLogToCasier({
        action: AuditLogEvent.MemberUpdate,
        guildId: "g1",
        targetId: "u1",
        executorId: "mod1",
        changes: [{ key: "nick", old: "a", new: "b" }],
      }),
    ).toBeNull();
  });
});

describe("recordCasierSanction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCasierDedupForTests();
    mockPrisma.sanction.findFirst.mockResolvedValue(null);
    mockPrisma.sanction.create.mockResolvedValue({ id: 42 });
    mockRecordSanction.mockResolvedValue({});
  });

  it("writes sanction + risk + log for a kick", async () => {
    const result = await recordCasierSanction({
      guildId: "g1",
      userId: "u1",
      moderatorId: "mod1",
      type: "KICK",
      reason: "Insultes",
      source: "command",
    });
    expect(result).toEqual({ recorded: true, id: 42 });
    expect(mockPrisma.sanction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "KICK",
          userId: "u1",
          guildId: "g1",
          reason: "Insultes",
        }),
      }),
    );
    expect(mockRecordSanction).toHaveBeenCalledWith("u1", "g1", "KICK");
    expect(mockCreateLog).toHaveBeenCalledWith(expect.objectContaining({ type: "kick" }));
  });

  it("does not duplicate a second BAN within the dedup window", async () => {
    await recordCasierSanction({
      guildId: "g1",
      userId: "u1",
      moderatorId: "mod1",
      type: "BAN",
      reason: "Raid",
    });
    const second = await recordCasierSanction({
      guildId: "g1",
      userId: "u1",
      moderatorId: "mod2",
      type: "BAN",
      reason: "Raid",
      source: "audit",
    });
    expect(second.duplicate).toBe(true);
    expect(mockPrisma.sanction.create).toHaveBeenCalledTimes(1);
  });

  it("skips extra ban logs (guildBanAdd already writes them) and skip risk for UNBAN", async () => {
    await recordCasierSanction({
      guildId: "g1",
      userId: "u1",
      moderatorId: "mod1",
      type: "BAN",
      reason: "Raid",
    });
    expect(mockCreateLog).not.toHaveBeenCalled();

    resetCasierDedupForTests();
    mockPrisma.sanction.findFirst.mockResolvedValue(null);
    await recordCasierSanction({
      guildId: "g1",
      userId: "u1",
      moderatorId: "mod1",
      type: "UNBAN",
      reason: "Pardon",
    });
    expect(mockRecordSanction).toHaveBeenCalledTimes(1);
    expect(mockRecordSanction).toHaveBeenCalledWith("u1", "g1", "BAN");
  });
});
