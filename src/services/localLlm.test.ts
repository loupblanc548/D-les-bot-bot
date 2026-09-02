import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  chatWithLocalLlm,
  checkLocalLlmAvailability,
  isLocalLlmAvailable,
  preWarmLocalModel,
  startLocalLlmHealthCheck,
  stopLocalLlmHealthCheck,
} from "./localLlm.js";

describe("localLlm standby", () => {
  const savedEnabled = process.env.LOCAL_LLM_ENABLED;
  const savedStandby = process.env.OLLAMA_STANDBY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.LOCAL_LLM_ENABLED;
    delete process.env.OLLAMA_STANDBY;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    stopLocalLlmHealthCheck();
    globalThis.fetch = originalFetch;
    if (savedEnabled === undefined) delete process.env.LOCAL_LLM_ENABLED;
    else process.env.LOCAL_LLM_ENABLED = savedEnabled;
    if (savedStandby === undefined) delete process.env.OLLAMA_STANDBY;
    else process.env.OLLAMA_STANDBY = savedStandby;
  });

  it("does not ping Ollama or load Qwen when flags are unset", async () => {
    const ok = await checkLocalLlmAvailability();
    expect(ok).toBe(false);
    expect(isLocalLlmAvailable()).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await chatWithLocalLlm([{ role: "user", content: "hi" }])).toBeNull();
    await preWarmLocalModel();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    startLocalLlmHealthCheck();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not ping Ollama when OLLAMA_STANDBY=true even if local is enabled", async () => {
    process.env.LOCAL_LLM_ENABLED = "true";
    process.env.OLLAMA_STANDBY = "true";
    const ok = await checkLocalLlmAvailability();
    expect(ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("pings Ollama only when local is explicitly enabled and standby is off", async () => {
    process.env.LOCAL_LLM_ENABLED = "true";
    process.env.OLLAMA_STANDBY = "false";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "qwen2.5:14b" }] }),
    });
    const ok = await checkLocalLlmAvailability();
    expect(ok).toBe(true);
    expect(isLocalLlmAvailable()).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});
