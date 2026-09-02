/**
 * Pushes the conversational path: Obsidian vault + every whitelisted tool
 * that can run without Discord privileges or paid APIs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma.js", () => ({
  default: {
    userMemory: { findUnique: vi.fn(), upsert: vi.fn() },
    memoryFact: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), deleteMany: vi.fn() },
    memoryEmbedding: { deleteMany: vi.fn() },
  },
}));

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./toolGuardrails.js", () => ({
  checkToolPermission: vi.fn().mockResolvedValue({ allowed: true, level: "user", reason: "" }),
}));

import { ALL_AGENT_TOOLS, executeTool, type ToolContext } from "./agentTools.js";
import { routeTools } from "./agentToolRouter.js";
import { resetQaIndexCache, saveQA } from "./obsidianMemory.js";
import { MEMORY_CONFIG } from "../utils/memoryConfig.js";

function mockCtx(): ToolContext {
  return {
    client: { user: { id: "bot-1" } } as ToolContext["client"],
    message: {
      author: { id: "user-1", tag: "tester#0001" },
      guildId: "guild-1",
      channelId: "chan-1",
      content: "test",
    } as ToolContext["message"],
    userId: "user-1",
    guildId: "guild-1",
    channelId: "chan-1",
  };
}

describe("conversation push — tools + Obsidian + 8GB budget", () => {
  let vault: string;
  const prevVault = process.env.OBSIDIAN_VAULT_PATH;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), "conv-qa-"));
    process.env.OBSIDIAN_VAULT_PATH = vault;
    resetQaIndexCache();
  });

  afterEach(() => {
    resetQaIndexCache();
    if (prevVault === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = prevVault;
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  it("keeps the Node heap budget at or under 1.5G on a VPS 8 Go profile", () => {
    expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBeLessThanOrEqual(4096);
    const vps8 = MEMORY_CONFIG.PROFILE === "vps8" || MEMORY_CONFIG.PROFILE === "tight";
    if (vps8) {
      expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBeLessThanOrEqual(1536);
      expect(MEMORY_CONFIG.SKIP_LLM_PREWARM).toBe(true);
    }
  });

  it("exposes every whitelisted tool on a non-trivial question", () => {
    const routed = routeTools(
      "Explique Docker, cherche sur le web, donne la météo, un hash sha256, et fouille Obsidian",
      ALL_AGENT_TOOLS,
      false,
    );
    const names = new Set(routed.map((t) => t.function.name));
    expect(names.has("searchObsidianQA")).toBe(true);
    expect(names.has("getWikipediaSummary")).toBe(true);
    expect(names.has("hash_gen")).toBe(true);
    expect(routed.length).toBeGreaterThanOrEqual(20);
    expect(ALL_AGENT_TOOLS.some((t) => t.function.name === "searchObsidianQA")).toBe(true);
    expect(ALL_AGENT_TOOLS.length).toBeGreaterThanOrEqual(40);
  });

  it("runs local tools and the Obsidian Q&A tool end to end", async () => {
    await saveQA(
      "Qu'est-ce que Docker ?",
      "Docker permet d'isoler des applications dans des conteneurs.",
      "tech",
    );

    const ctx = mockCtx();
    const rssBefore = process.memoryUsage().rss;

    const json = await executeTool("json_format", { json: '{"a":1,"b":2}' }, ctx);
    expect(json.success).toBe(true);

    const regex = await executeTool("regex_test", { pattern: "foo+", testString: "foooo" }, ctx);
    expect(regex.success).toBe(true);

    const hash = await executeTool("hash_gen", { input: "bonjour" }, ctx);
    expect(hash.success).toBe(true);
    expect(String(hash.data)).toMatch(/[a-f0-9]{32}/i);

    const pwd = await executeTool("generate_password", { length: 16 }, ctx);
    expect(pwd.success).toBe(true);

    const obsidian = await executeTool("searchObsidianQA", { query: "Docker" }, ctx);
    expect(obsidian.success).toBe(true);
    expect(obsidian.data).toContain("conteneurs");

    const wiki = await executeTool("getWikipediaSummary", { query: "Linux", lang: "fr" }, ctx);
    if (wiki.success) {
      expect(wiki.data.toLowerCase()).toMatch(/linux|gnu|syst[eè]me/);
    }

    const rssAfter = process.memoryUsage().rss;
    const deltaMb = (rssAfter - rssBefore) / (1024 * 1024);
    expect(deltaMb).toBeLessThan(200);
  }, 30_000);

  it("keeps Qwen/Ollama in standby so 8GB RAM is not eaten by weights", async () => {
    const { shouldUseLocalOllama, isOllamaStandby } = await import("../utils/localLlmGate.js");
    const { isLocalLlmAvailable, checkLocalLlmAvailability } = await import("./localLlm.js");
    expect(isOllamaStandby({})).toBe(true);
    expect(shouldUseLocalOllama({})).toBe(false);
    expect(isLocalLlmAvailable()).toBe(false);
    const pinged = await checkLocalLlmAvailability();
    expect(pinged).toBe(false);
  });

  it("routes questions through the agent, not the trivial fast-path", async () => {
    const { needsAgentLoop } = await import("./agentIntent.js");
    const { getTrivialResponse } = await import("./trivialFastPath.js");
    expect(getTrivialResponse("ok", "u1")).not.toBeNull();
    expect(getTrivialResponse("C'est quoi Docker ?", "u1")).toBeNull();
    expect(needsAgentLoop("C'est quoi Docker ?")).toBe(true);
    expect(needsAgentLoop("cherche la météo à Paris et hash bonjour")).toBe(true);
    expect(needsAgentLoop("ok")).toBe(false);
  });

  it("indexes hundreds of Obsidian Q&A without rereading every file", async () => {
    for (let i = 0; i < 120; i++) {
      await saveQA(`Qu'est-ce que Sujet${i} ?`, `Réponse numéro ${i} sur Sujet${i}.`, "tech");
    }
    await saveQA("Qu'est-ce que Kubernetes ?", "Orchestrateur de conteneurs.", "tech");
    const rssBefore = process.memoryUsage().rss;
    const t0 = Date.now();
    const { searchQA } = await import("./obsidianMemory.js");
    const hit = await searchQA("Kubernetes");
    const ms = Date.now() - t0;
    expect(hit?.answer).toContain("Orchestrateur");
    expect(ms).toBeLessThan(500);
    const rssDeltaMb = (process.memoryUsage().rss - rssBefore) / (1024 * 1024);
    expect(rssDeltaMb).toBeLessThan(80);
  }, 20_000);

  it("never wipes hashes when the last predefined subjects remain", async () => {
    const { listUnlearnedSubjects, subjectHash } = await import("./selfLearner.js");
    const topics = [
      { category: "tech", subjects: Array.from({ length: 50 }, (_, i) => `sujet-${i}`) },
    ];
    const learned = new Set(topics[0].subjects.slice(0, 49).map((s) => subjectHash(s)));
    const rest = listUnlearnedSubjects(topics, learned);
    expect(rest).toHaveLength(1);
    expect(rest[0].subject).toBe("sujet-49");
  });

  it("executes every local whitelist tool and probes the network ones", async () => {
    await saveQA("Qu'est-ce que Docker ?", "Runtime de conteneurs.", "tech");
    const ctx = mockCtx();

    const fixtures: Record<string, Record<string, unknown>> = {
      json_format: { json: '{"ok":true}' },
      regex_test: { pattern: "ab+", testString: "abbb" },
      hash_gen: { input: "fond-en-comble" },
      generate_password: { length: 12 },
      jwt_decode: {
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwibmFtZSI6IkpvaG4ifQ.x",
      },
      password_analyze: { password: "Test123!aa" },
      convert_units: { value: 10, from: "km", to: "mi" },
      convert_timezone: { time: "14:00", from_tz: "Europe/Paris", to_tz: "UTC" },
      solve_math: { expression: "2 + 2" },
      searchObsidianQA: { query: "Docker" },
      system_stats: {},
      generate_qr_code: { data: "https://example.com" },
      getWikipediaSummary: { query: "France", lang: "fr" },
      getWiktionaryDefinition: { word: "bonjour", lang: "fr" },
      getWeather: { city: "Paris" },
      getAirQuality: { city: "Paris" },
      getCryptoPrice: { coin: "bitcoin" },
      get_crypto_top: {},
      get_hackernews_top: { count: 3 },
      get_github_trending: {},
      dns_lookup: { domain: "example.com" },
      url_expand: { url: "https://example.com" },
      ip_ping: { ip: "127.0.0.1", count: 1 },
      whois_lookup: { domain: "example.com" },
      searchYouTube: { query: "linux", maxResults: 1 },
      get_steam_requirements: { appid: "730" },
      reddit_search: { query: "linux" },
      search_public_apis: { query: "weather" },
      get_dev_snippet: { query: "debounce" },
      search_programming_books: { topic: "python" },
      search_system_design: { topic: "caching" },
      getSteamGame: { query: "portal" },
      searchRetailers: { query: "ssd" },
      think_step_by_step: { thought: "2+2=4" },
      searchRawgGames: { query: "portal" },
      search_igdb_games: { query: "zelda" },
      get_twitch_clips: { game: "Fortnite" },
      generate_image: { prompt: "a cat" },
      translateText: { text: "hello", target: "fr" },
      searchWeb: { query: "docker" },
      readUrl: { url: "https://example.com" },
      fetchAndSummarize: { url: "https://example.com" },
      searchKnowledge: { query: "docker" },
      searchDocs: { library: "react", question: "hooks" },
      execute_code: { language: "javascript", code: "1+1" },
      getBotStatus: {},
      getServerStats: {},
      getUserInfo: { userId: "user-1" },
      deleteMessages: { count: 1 },
      timeoutUser: { userId: "user-1", duration: 60 },
      searchUserMemory: { query: "test" },
      saveMemoryFact: { key: "test", value: "ok" },
      memory_search: { query: "test" },
      delegate_to_expert: { task: "hello", tier: "small" },
      think_step_by_step: { question: "2+2" },
    };

    const mustWork = new Set([
      "json_format",
      "regex_test",
      "hash_gen",
      "generate_password",
      "jwt_decode",
      "password_analyze",
      "convert_units",
      "convert_timezone",
      "solve_math",
      "searchObsidianQA",
      "system_stats",
    ]);

    const discordOnly = new Set([
      "deleteMessages",
      "timeoutUser",
      "getUserInfo",
      "getServerStats",
      "getBotStatus",
    ]);

    const results: { name: string; ok: boolean; snippet: string }[] = [];
    const rssBefore = process.memoryUsage().rss;

    for (const tool of ALL_AGENT_TOOLS) {
      const name = tool.function.name;
      const args = fixtures[name] ?? {};
      try {
        const result = await Promise.race([
          executeTool(name, args, ctx),
          new Promise<{ success: false; data: string }>((resolve) =>
            setTimeout(() => resolve({ success: false, data: "timeout 12s" }), 12_000),
          ),
        ]);
        results.push({
          name,
          ok: result.success,
          snippet: String(result.data).slice(0, 120),
        });
        if (mustWork.has(name)) {
          expect(result.success, `${name} should succeed locally: ${result.data}`).toBe(true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ name, ok: false, snippet: msg.slice(0, 120) });
        if (mustWork.has(name)) {
          throw err;
        }
        if (!discordOnly.has(name)) {
          // Network/API tools may throw; they must not crash the process.
          expect(msg.length).toBeGreaterThan(0);
        }
      }
    }

    const localOk = new Set(results.filter((r) => mustWork.has(r.name) && r.ok).map((r) => r.name));
    expect(localOk.size).toBe(mustWork.size);

    const uniqueNames = new Set(results.map((r) => r.name));
    expect(uniqueNames.size).toBe(ALL_AGENT_TOOLS.length);
    expect(ALL_AGENT_TOOLS.length).toBeGreaterThanOrEqual(40);

    const rssDeltaMb = (process.memoryUsage().rss - rssBefore) / (1024 * 1024);
    expect(rssDeltaMb).toBeLessThan(250);

    const report = results
      .map((r) => `${r.ok ? "OK" : "NO"} ${r.name} — ${r.snippet.replace(/\s+/g, " ")}`)
      .join("\n");
    expect(report.length).toBeGreaterThan(100);
  }, 120_000);

  it("plays a full conversation: miss in Obsidian, Wikipedia, then hit on retry", async () => {
    const ctx = mockCtx();
    const { needsAgentLoop } = await import("./agentIntent.js");
    const question = "C'est quoi Linux ?";
    expect(needsAgentLoop(question)).toBe(true);

    const miss = await executeTool("searchObsidianQA", { query: "Linux" }, ctx);
    expect(miss.success).toBe(false);

    const wiki = await executeTool("getWikipediaSummary", { query: "Linux", lang: "fr" }, ctx);
    const answer = wiki.success
      ? wiki.data
      : "Linux est un noyau et un système d'exploitation libre.";
    const { saveQA: persist } = await import("./obsidianMemory.js");
    await persist(
      question,
      typeof answer === "string" ? answer.slice(0, 800) : String(answer),
      "tech",
    );

    const hit = await executeTool("searchObsidianQA", { query: "Linux" }, ctx);
    expect(hit.success).toBe(true);
    expect(hit.data.toLowerCase()).toMatch(/linux/);
  }, 30_000);
});
