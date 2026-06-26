/**
 * ChannelRouter.test.ts - Tests unitaires du routeur multi-plateforme
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogger = vi.hoisted(() => globalThis.__createMockLogger());
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import {
  detectPlatforms,
  resolveChannelIds,
  buildPlatformEmbed,
  dispatchToChannels,
  routeArticle,
  RoutedArticle,
} from "./ChannelRouter.js";
import { PLATFORM_CONFIGS } from "./ChannelRouter.js";
import { EmbedBuilder, Client } from "discord.js";

// --- Helpers ---

function makeClientMock(): Client {
  return {
    channels: {
      fetch: vi.fn().mockImplementation(async (id: string) => ({
        id,
        name: `channel-${id}`,
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      })),
    },
  } as unknown as Client;
}

function setEnv(key: string, value: string) {
  process.env[key] = value;
}

function clearEnv() {
  for (const cfg of PLATFORM_CONFIGS) {
    delete process.env[cfg.envChannelKey];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  clearEnv();
});

describe("detectPlatforms", () => {
  it("detects Steam/PC from title", () => {
    const result = detectPlatforms("Great Steam Summer Sale");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Steam/PC");
  });

  it("detects PlayStation from title", () => {
    const result = detectPlatforms("PlayStation Plus Free Games");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("PlayStation");
  });

  it("detects Xbox from title", () => {
    const result = detectPlatforms("Xbox Game Pass New Titles");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Xbox");
  });

  it("detects Nintendo from title", () => {
    const result = detectPlatforms("Nintendo Switch eShop Sale");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Nintendo");
  });

  it("detects Fortnite from title", () => {
    const result = detectPlatforms("Fortnite Chapter 6 Update");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fortnite");
  });

  it("detects multiple platforms in one title", () => {
    const result = detectPlatforms("Steam vs Epic Games Store Sale");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for unrelated title", () => {
    const result = detectPlatforms("Today weather forecast");
    expect(result).toEqual([]);
  });

  it("is case insensitive", () => {
    const result = detectPlatforms("PLAYSTATION NEWS");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("PlayStation");
  });

  it("matches Xbox with 'game pass' keyword", () => {
    const result = detectPlatforms("New on Game Pass");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Xbox");
  });
});

describe("resolveChannelIds", () => {
  it("returns channel IDs for matched platforms", () => {
    setEnv("STEAM_EPIC_CHANNEL_ID", "111");
    setEnv("PLAYSTATION_CHANNEL_ID", "222");

    const platforms = PLATFORM_CONFIGS.filter(
      (p) => p.name === "Steam/PC" || p.name === "PlayStation",
    );
    const result = resolveChannelIds(platforms);

    expect(result).toContain("111");
    expect(result).toContain("222");
  });

  it("returns empty array when no env vars are set", () => {
    const platforms = PLATFORM_CONFIGS.filter((p) => p.name === "Steam/PC");
    const result = resolveChannelIds(platforms);

    expect(result).toEqual([]);
  });

  it("deduplicates channel IDs", () => {
    setEnv("STEAM_EPIC_CHANNEL_ID", "111");
    setEnv("PLAYSTATION_CHANNEL_ID", "111");

    const platforms = PLATFORM_CONFIGS.filter(
      (p) => p.name === "Steam/PC" || p.name === "PlayStation",
    );
    const result = resolveChannelIds(platforms);

    expect(result).toEqual(["111"]);
  });

  it("ignores empty env vars", () => {
    setEnv("STEAM_EPIC_CHANNEL_ID", "");

    const platforms = PLATFORM_CONFIGS.filter((p) => p.name === "Steam/PC");
    const result = resolveChannelIds(platforms);

    expect(result).toEqual([]);
  });
});

describe("buildPlatformEmbed", () => {
  it("creates an embed with correct platform color", () => {
    const article: Omit<RoutedArticle, "platforms" | "channelIds"> = {
      title: "Test Article",
      content: "Some content",
      url: "https://example.com",
      pubDate: "2026-01-01T00:00:00Z",
      image: "https://example.com/image.jpg",
    };
    const platform = PLATFORM_CONFIGS[0];

    const embed = buildPlatformEmbed(article, platform);

    expect(embed).toBeInstanceOf(EmbedBuilder);
  });

  it("truncates content over 1800 chars", () => {
    const article: Omit<RoutedArticle, "platforms" | "channelIds"> = {
      title: "Long Article",
      content: "A".repeat(2000),
      url: "https://example.com",
      pubDate: "2026-01-01T00:00:00Z",
    };
    const platform = PLATFORM_CONFIGS[0];

    const embed = buildPlatformEmbed(article, platform);
    expect(embed).toBeInstanceOf(EmbedBuilder);
  });
});

describe("dispatchToChannels", () => {
  it("sends to configured channels", async () => {
    setEnv("STEAM_EPIC_CHANNEL_ID", "channel-1");

    const article: RoutedArticle = {
      title: "Steam Sale",
      content: "Big discounts!",
      url: "https://store.steampowered.com",
      pubDate: "2026-01-01",
      platforms: ["Steam/PC"],
      channelIds: ["channel-1"],
    };

    const client = makeClientMock();
    const result = await dispatchToChannels(client, article);

    expect(result.routed).toBe(true);
    expect(result.sentTo).toContain("channel-1");
    expect(result.errors).toHaveLength(0);
  });

  it("returns errors when channel is not text-based", async () => {
    setEnv("STEAM_EPIC_CHANNEL_ID", "channel-1");

    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({ id: "channel-1", isTextBased: () => false }),
      },
    } as unknown as Client;

    const article: RoutedArticle = {
      title: "Test",
      content: "",
      url: "",
      pubDate: "2026-01-01",
      platforms: ["Steam/PC"],
      channelIds: ["channel-1"],
    };

    const result = await dispatchToChannels(client, article);

    expect(result.routed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("introuvable ou non textuel");
  });

  it("returns early when channelIds is empty", async () => {
    const article: RoutedArticle = {
      title: "Test",
      content: "",
      url: "",
      pubDate: "2026-01-01",
      platforms: [],
      channelIds: [],
    };

    const client = makeClientMock();
    const result = await dispatchToChannels(client, article);

    expect(result.routed).toBe(false);
    expect(result.errors[0]).toContain("Aucun channel");
  });

  it("continues to next channel when one channel fails", async () => {
    setEnv("STEAM_EPIC_CHANNEL_ID", "channel-1");
    setEnv("PLAYSTATION_CHANNEL_ID", "channel-2");

    const client = {
      channels: {
        fetch: vi
          .fn()
          .mockResolvedValueOnce({
            id: "channel-1",
            isTextBased: () => true,
            name: "steam",
            send: vi.fn().mockResolvedValue(undefined),
          })
          .mockRejectedValueOnce(new Error("Network error")),
      },
    } as unknown as Client;

    const article: RoutedArticle = {
      title: "Multi-platform",
      content: "",
      url: "",
      pubDate: "2026-01-01",
      platforms: ["Steam/PC", "PlayStation"],
      channelIds: ["channel-1", "channel-2"],
    };

    const result = await dispatchToChannels(client, article);

    expect(result.sentTo).toContain("channel-1");
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("routeArticle", () => {
  it("routes an article through the full pipeline", async () => {
    setEnv("STEAM_EPIC_CHANNEL_ID", "channel-steam");

    const client = makeClientMock();
    const result = await routeArticle(
      client,
      "Steam Big Sale",
      "Great discounts on Steam",
      "https://store.steampowered.com",
      "2026-01-01T00:00:00Z",
    );

    expect(result.routed).toBe(true);
    expect(result.article.platforms).toContain("Steam/PC");
    expect(result.sentTo.length).toBeGreaterThan(0);
  });

  it("does not route when no platform matches", async () => {
    const client = makeClientMock();
    const result = await routeArticle(
      client,
      "Random news",
      "Some content",
      "https://example.com",
      "2026-01-01T00:00:00Z",
    );

    expect(result.sentTo).toHaveLength(0);
    expect(result.article.platforms).toHaveLength(0);
  });

  it("detects platforms and includes them in the article", async () => {
    setEnv("NINTENDO_CHANNEL_ID", "channel-nintendo");

    const client = makeClientMock();
    const result = await routeArticle(
      client,
      "New Nintendo Switch Update",
      "Nintendo news",
      "https://nintendo.com",
      "2026-01-01",
    );

    expect(result.article.platforms).toContain("Nintendo");
  });
});
