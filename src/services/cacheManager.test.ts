/**
 * cacheManager.test.ts — Tests pour la façade de cache unifiée
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock les dépendances
vi.mock("./cache.js", () => ({
  default: {
    get: vi.fn((key: string) => `memory-${key}`),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("./multiLevelCache.js", () => ({
  default: {
    get: vi.fn(async (key: string) => `multi-${key}`),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
  },
}));

vi.mock("./responseCache.js", () => ({
  getCachedResponse: vi.fn((key: string) => `ai-${key}`),
  setCachedResponse: vi.fn(),
}));

vi.mock("./llmCache.js", () => ({
  getCachedCompletion: vi.fn(async (prompt: string, model: string) => `llm-${model}-${prompt}`),
  setCachedCompletion: vi.fn(async () => {}),
}));

vi.mock("./toolResultCache.js", () => ({
  getCachedToolResult: vi.fn(
    async (toolName: string, args: Record<string, unknown>) => `tool-${toolName}`,
  ),
  setCachedToolResult: vi.fn(async () => {}),
}));

vi.mock("../utils/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("cacheManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("get", () => {
    it("should get from memory tier", async () => {
      const { get } = await import("./cacheManager.js");
      const result = await get("test-key", { tier: "memory" });
      expect(result).toBe("memory-test-key");
    });

    it("should get from multi tier", async () => {
      const { get } = await import("./cacheManager.js");
      const result = await get("test-key", { tier: "multi" });
      expect(result).toBe("multi-test-key");
    });

    it("should get from ai tier", async () => {
      const { get } = await import("./cacheManager.js");
      const result = await get("test-key", { tier: "ai" });
      expect(result).toBe("ai-test-key");
    });

    it("should get from llm tier", async () => {
      const { get } = await import("./cacheManager.js");
      const result = await get("test-prompt", { tier: "llm", model: "test-model" } as never);
      expect(result).toBe("llm-test-model-test-prompt");
    });

    it("should return null on error", async () => {
      const { get } = await import("./cacheManager.js");
      const result = await get("test-key", { tier: "unknown" as never });
      expect(result).toBeNull();
    });
  });

  describe("set", () => {
    it("should set in memory tier without throwing", async () => {
      const { set } = await import("./cacheManager.js");
      await expect(set("key", "value", { tier: "memory" })).resolves.toBeUndefined();
    });

    it("should set in multi tier without throwing", async () => {
      const { set } = await import("./cacheManager.js");
      await expect(set("key", "value", { tier: "multi" })).resolves.toBeUndefined();
    });

    it("should set in ai tier without throwing", async () => {
      const { set } = await import("./cacheManager.js");
      await expect(set("key", "value", { tier: "ai" })).resolves.toBeUndefined();
    });
  });

  describe("del", () => {
    it("should delete without throwing", async () => {
      const { del } = await import("./cacheManager.js");
      await expect(del("test-key")).resolves.toBeUndefined();
    });
  });

  describe("invalidatePrefix", () => {
    it("should invalidate without throwing", async () => {
      const { invalidatePrefix } = await import("./cacheManager.js");
      await expect(invalidatePrefix("test:")).resolves.toBeUndefined();
    });
  });

  describe("getStats", () => {
    it("should return stats object", async () => {
      const { getStats } = await import("./cacheManager.js");
      const stats = getStats();
      expect(stats).toBeDefined();
      expect(stats.timestamp).toBeDefined();
    });
  });
});
