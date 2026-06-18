/**
 * aiMemory.test.ts — Unit tests for src/services/aiMemory.ts
 *
 * Prisma client is fully mocked so the tests run without a real database.
 * Each test asserts both the side-effects (which Prisma methods were
 * called and with what payload) AND the returned shape.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mock — runs before any import.
vi.mock("../prisma", () => {
  const mock = {
    memoryFact: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    memoryMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    userMemory: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    memoryDecayLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { default: mock, ...mock };
});

import prisma from "../prisma.js";
import {
  remember,
  recall,
  forget,
  forgetAll,
  appendMessage,
  setTone,
  setSummary,
  decayStep,
  purgeExpired,
} from "./aiMemory.js";

const m = prisma as unknown as {
  memoryFact: {
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  memoryMessage: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  userMemory: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  memoryDecayLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction behaves like a sequential executor when given an array.
  m.$transaction.mockImplementation(async (queries: Array<{ data: unknown }>) => {
    const out = [];
    for (const q of queries) {
      if (q) out.push({ ok: true, data: q.data ?? null });
    }
    return out;
  });
});

describe("remember()", () => {
  it("creates a new fact with weight 1.0 and updates lastActiveAt", async () => {
    m.memoryFact.upsert.mockResolvedValue({});
    m.userMemory.upsert.mockResolvedValue({});

    await remember("user-1", "favoriteGame", "Hades II");

    expect(m.memoryFact.upsert).toHaveBeenCalledOnce();
    const args = m.memoryFact.upsert.mock.calls[0]?.[0] as {
      where: unknown;
      create: { weight: number };
      update: { weight: unknown };
    };
    expect(args.where).toEqual({ userId_key: { userId: "user-1", key: "favoriteGame" } });
    expect(args.create.weight).toBe(1.0);
    expect(args.update.weight).toEqual({ increment: 0.2 });
    expect(m.userMemory.upsert).toHaveBeenCalledOnce();
  });

  it("sets expiresAt when ttlDays is provided", async () => {
    m.memoryFact.upsert.mockResolvedValue({});
    m.userMemory.upsert.mockResolvedValue({});

    const before = Date.now();
    await remember("u", "k", "v", { ttlDays: 30 });
    const after = Date.now();

    const create = (
      m.memoryFact.upsert.mock.calls[0]?.[0] as { create: { expiresAt: Date | null } }
    ).create;
    expect(create.expiresAt).toBeInstanceOf(Date);
    const diff = create.expiresAt!.getTime();
    expect(diff).toBeGreaterThanOrEqual(before + 30 * 86_400_000);
    expect(diff).toBeLessThanOrEqual(after + 30 * 86_400_000 + 50);
  });

  it("rejects empty userId or key", async () => {
    await expect(remember("", "k", "v")).rejects.toThrow();
    await expect(remember("u", "", "v")).rejects.toThrow();
  });
});

describe("recall()", () => {
  it("returns facts in weight order with bumped access counters", async () => {
    const now = new Date();
    m.userMemory.findUnique.mockResolvedValue({
      guildId: "g1",
      tone: "casual",
      locale: "fr",
      summary: null,
      lastActiveAt: now,
    });
    m.memoryFact.findMany.mockResolvedValue([
      {
        id: "a",
        key: "fav",
        value: "Hades II",
        weight: 0.9,
        category: "preference",
        createdAt: now,
      },
      { id: "b", key: "tz", value: "EST", weight: 0.5, category: null, createdAt: now },
    ]);
    m.memoryMessage.findMany.mockResolvedValue([
      { id: "m2", role: "assistant", content: "hello", channelId: "c1", createdAt: now },
      {
        id: "m1",
        role: "user",
        content: "hi",
        channelId: "c1",
        createdAt: new Date(now.getTime() - 2000),
      },
    ]);
    m.memoryFact.updateMany.mockResolvedValue({ count: 2 });
    m.userMemory.upsert.mockResolvedValue({});

    const snap = await recall("user-1");

    expect(snap.facts[0]?.key).toBe("fav");
    expect(snap.facts).toHaveLength(2);
    // Messages are reversed to chronological order.
    expect(snap.recentMessages[0]?.role).toBe("user");
    expect(snap.recentMessages[1]?.role).toBe("assistant");
    expect(m.memoryFact.updateMany).toHaveBeenCalledOnce();
    const payload = (m.memoryFact.updateMany.mock.calls[0]?.[0] as { data: { weight: unknown } })
      .data;
    expect(payload.weight).toEqual({ increment: 0.05 });
  });

  it("filters out expired and below-threshold facts", async () => {
    m.userMemory.findUnique.mockResolvedValue(null);
    m.memoryFact.findMany.mockResolvedValue([]);
    m.memoryMessage.findMany.mockResolvedValue([]);
    m.userMemory.upsert.mockResolvedValue({});

    await recall("u", { minWeight: 0.2 });

    const where = (
      m.memoryFact.findMany.mock.calls[0]?.[0] as {
        where: { weight: { gte: number }; OR: unknown };
      }
    ).where;
    expect(where.weight.gte).toBe(0.2);
    expect(where.OR).toBeDefined();
  });

  it("returns an empty snapshot when userId is empty", async () => {
    const snap = await recall("");
    expect(snap.facts).toHaveLength(0);
    expect(snap.recentMessages).toHaveLength(0);
    expect(m.userMemory.findUnique).not.toHaveBeenCalled();
  });

  it("respects channelId filter on messages", async () => {
    m.userMemory.findUnique.mockResolvedValue(null);
    m.memoryFact.findMany.mockResolvedValue([]);
    m.memoryMessage.findMany.mockResolvedValue([]);
    m.userMemory.upsert.mockResolvedValue({});

    await recall("u", { channelId: "c1" });

    const where = (
      m.memoryMessage.findMany.mock.calls[0]?.[0] as {
        where: { userId: string; channelId: string };
      }
    ).where;
    expect(where).toEqual({ userId: "u", channelId: "c1" });
  });
});

describe("forget()", () => {
  it("removes a single fact by key", async () => {
    m.memoryFact.deleteMany.mockResolvedValue({ count: 1 });

    const n = await forget("u", "fav");

    expect(n).toBe(1);
    expect(m.memoryFact.deleteMany).toHaveBeenCalledWith({ where: { userId: "u", key: "fav" } });
  });

  it("removes all facts when key is omitted", async () => {
    m.memoryFact.deleteMany.mockResolvedValue({ count: 4 });

    const n = await forget("u");

    expect(n).toBe(4);
    expect(m.memoryFact.deleteMany).toHaveBeenCalledWith({ where: { userId: "u" } });
  });
});

describe("forgetAll()", () => {
  it("removes facts, messages, and user record in a transaction", async () => {
    await forgetAll("u");
    expect(m.$transaction).toHaveBeenCalledOnce();
    const ops = m.$transaction.mock.calls[0]?.[0] as Array<unknown>;
    expect(ops).toHaveLength(3);
  });
});

describe("appendMessage()", () => {
  it("runs upsert(user) then create(message) in a transaction", async () => {
    await appendMessage("u", "user", "hello there friend", "c1");
    expect(m.$transaction).toHaveBeenCalledOnce();
    expect(m.userMemory.upsert).toHaveBeenCalledOnce();
    expect(m.memoryMessage.create).toHaveBeenCalledOnce();
    expect(m.memoryMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u",
          role: "user",
          content: "hello there friend",
          channelId: "c1",
        }),
      }),
    );
  });

  it("approximates tokens via 4-chars-per-token heuristic", async () => {
    await appendMessage("u", "assistant", "x".repeat(400));
    expect(m.memoryMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tokens: 100 }) }),
    );
  });

  it("rejects invalid input", async () => {
    await expect(appendMessage("", "user", "x")).rejects.toThrow();
    await expect(appendMessage("u", "user", "")).rejects.toThrow();
  });
});

describe("setTone() and setSummary()", () => {
  it("setTone upserts with valid tone", async () => {
    m.userMemory.upsert.mockResolvedValue({});
    await setTone("u", "meme");
    const args = (m.userMemory.upsert.mock.calls[0]?.[0] as { update: { tone: string } }).update;
    expect(args.tone).toBe("meme");
  });

  it("setTone rejects invalid tone values", async () => {
    await expect(setTone("u", "yolo" as unknown as "casual")).rejects.toThrow();
  });

  it("setSummary stores a rolling summary", async () => {
    m.userMemory.upsert.mockResolvedValue({});
    await setSummary("u", "Loves indie roguelikes, lives in EST.");
    const args = (m.userMemory.upsert.mock.calls[0]?.[0] as { update: { summary: string } }).update;
    expect(args.summary).toContain("roguelikes");
  });
});

describe("decayStep()", () => {
  it("multiplicatively decays weight, then prunes below floor", async () => {
    m.memoryFact.findMany.mockResolvedValue([
      { id: "a", userId: "u1", weight: 0.5 },
      { id: "b", userId: "u2", weight: 0.04 },
    ]);
    m.memoryFact.update.mockResolvedValue({});
    m.memoryFact.delete.mockResolvedValue({});
    m.memoryDecayLog.create.mockResolvedValue({});

    const result = await decayStep({ factor: 0.5, minWeight: 0.1 });

    expect(result.processed).toBe(2);
    expect(result.pruned).toBe(1);
    expect(m.memoryFact.delete).toHaveBeenCalledWith({ where: { id: "b" } });
    expect(m.memoryFact.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { weight: 0.25 },
    });
    expect(m.memoryDecayLog.create).toHaveBeenCalledOnce();
  });

  it("is a no-op when no stale facts exist", async () => {
    m.memoryFact.findMany.mockResolvedValue([]);
    m.memoryDecayLog.create.mockResolvedValue({});

    const result = await decayStep();

    expect(result.processed).toBe(0);
    expect(result.pruned).toBe(0);
    expect(m.memoryFact.delete).not.toHaveBeenCalled();
  });
});

describe("purgeExpired()", () => {
  it("deletes facts whose expiresAt is strictly in the past", async () => {
    m.memoryFact.deleteMany.mockResolvedValue({ count: 7 });

    const n = await purgeExpired();

    expect(n).toBe(7);
    const args = (
      m.memoryFact.deleteMany.mock.calls[0]?.[0] as { where: { expiresAt: { lt: unknown } } }
    ).where;
    expect(args.expiresAt.lt).toBeInstanceOf(Date);
  });
});
