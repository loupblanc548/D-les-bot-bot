import { afterEach, describe, expect, it, vi } from "vitest";

async function loadSandbox(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string);
  return import("./codeSandbox.js");
}

afterEach(() => vi.unstubAllEnvs());

describe("codeSandbox", () => {
  it("refuses to run code on the bot host without an isolated sandbox", async () => {
    const { executeCode, isSandboxAvailable } = await loadSandbox({
      E2B_API_KEY: "",
      CODE_SANDBOX_ALLOW_LOCAL: "",
    });
    const result = await executeCode("console.log(process.env.DISCORD_TOKEN)", "javascript");
    expect(result.success).toBe(false);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("désactivée");
    expect(isSandboxAvailable()).toBe(false);
  });

  it("does not leak the bot environment when local execution is opted in", async () => {
    const { executeCode } = await loadSandbox({
      E2B_API_KEY: "",
      CODE_SANDBOX_ALLOW_LOCAL: "true",
      DISCORD_TOKEN: "super-secret-token",
    });
    const result = await executeCode(
      "console.log(JSON.stringify({ t: process.env.DISCORD_TOKEN ?? null }))",
      "javascript",
    );
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('{"t":null}');
    expect(result.stdout).not.toContain("super-secret-token");
  });
});
