import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { isOllamaAvailable, ollamaChat } from "./ollama.js";

describe("utils/ollama standby", () => {
  const savedEnabled = process.env.LOCAL_LLM_ENABLED;
  const savedStandby = process.env.OLLAMA_STANDBY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.LOCAL_LLM_ENABLED;
    delete process.env.OLLAMA_STANDBY;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedEnabled === undefined) delete process.env.LOCAL_LLM_ENABLED;
    else process.env.LOCAL_LLM_ENABLED = savedEnabled;
    if (savedStandby === undefined) delete process.env.OLLAMA_STANDBY;
    else process.env.OLLAMA_STANDBY = savedStandby;
  });

  it("skips translator/chat HTTP when Qwen is on standby", async () => {
    expect(await isOllamaAvailable()).toBe(false);
    expect(await ollamaChat("sys", "user")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
