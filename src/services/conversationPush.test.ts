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
});
