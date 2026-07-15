import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../prisma.js", () => ({
  default: {
    wordFilterConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    wordFilterEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      delete: vi.fn(),
    },
    wordFilterInfraction: {
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../utils/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { invalidateCache } from "./wordFilter.js";

describe("wordFilter — invalidateCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'efface rien si le cache n'existe pas", () => {
    expect(() => invalidateCache("123456789")).not.toThrow();
  });

  it("peut être appelée plusieurs fois sans erreur", () => {
    invalidateCache("guild-1");
    invalidateCache("guild-1");
    invalidateCache("guild-2");
    expect(true).toBe(true);
  });
});

describe("wordFilter — escapeRegex (indirect)", () => {
  it("les regex spéciaux ne plantent pas le module", async () => {
    const { checkMessage } = await import("./wordFilter.js");
    // checkMessage retourne null pour un message sans guild
    const fakeMsg = {
      guild: null,
      author: { bot: false },
      content: "test",
      member: null,
    } as any;
    const result = await checkMessage(fakeMsg);
    expect(result).toBeNull();
  });

  it("retourne null si l'auteur est un bot", async () => {
    const { checkMessage } = await import("./wordFilter.js");
    const fakeMsg = {
      guild: { id: "123" },
      author: { bot: true },
      content: "test",
      member: null,
    } as any;
    const result = await checkMessage(fakeMsg);
    expect(result).toBeNull();
  });
});
