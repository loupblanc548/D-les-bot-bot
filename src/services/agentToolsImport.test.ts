import { describe, expect, it } from "vitest";
import { IMPORT_TOOL_NAMES, executeImportTool } from "./agentToolsImport.js";
import type { ToolContext } from "./agentTools.js";

function ctx(): ToolContext {
  return {
    client: { guilds: { cache: { get: () => undefined } } } as unknown as ToolContext["client"],
    message: {} as ToolContext["message"],
    userId: "1",
    guildId: "1",
    channelId: "1",
  };
}

describe("agentToolsImport", () => {
  it("exposes a large read-only catalogue", () => {
    expect(IMPORT_TOOL_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(IMPORT_TOOL_NAMES).toContain("snowflakeDecode");
    expect(IMPORT_TOOL_NAMES).toContain("cveLookup");
    expect(IMPORT_TOOL_NAMES).toContain("emailAuth");
    expect(IMPORT_TOOL_NAMES).not.toContain("hydra_brute");
  });

  it("decodes a Discord snowflake locally", async () => {
    const result = await executeImportTool("snowflakeDecode", { id: "1512435587926200391" }, ctx());
    expect(result?.success).toBe(true);
    const data = JSON.parse(String(result?.data));
    expect(data.created).toMatch(/^202[0-9]-/);
  });

  it("returns EU VAT without network", async () => {
    const result = await executeImportTool("vatEu", { country: "FR" }, ctx());
    expect(result?.success).toBe(true);
    expect(String(result?.data)).toMatch(/20/);
  });

  it("fails fast without required args (no network)", async () => {
    const result = await executeImportTool("cveLookup", {}, ctx());
    expect(result?.success).toBe(false);
    expect(String(result?.data)).toMatch(/CVE/i);
  });

  it("counts tokens locally", async () => {
    const result = await executeImportTool("tokenCount", { text: "abcd".repeat(25) }, ctx());
    expect(result?.success).toBe(true);
    const data = JSON.parse(String(result?.data));
    expect(data.tokensApprox).toBe(25);
  });
});
