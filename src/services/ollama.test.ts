import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.fn();
const axiosPost = vi.fn();

vi.mock("axios", () => ({
  default: {
    get: (...args: unknown[]) => axiosGet(...args),
    post: (...args: unknown[]) => axiosPost(...args),
  },
}));

vi.mock("../utils/logger.js", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { chat, embed, generate, isOllamaAvailable, isOllamaConfigured } from "./ollama.js";

describe("services/ollama standby", () => {
  const savedEnabled = process.env.LOCAL_LLM_ENABLED;
  const savedStandby = process.env.OLLAMA_STANDBY;

  beforeEach(() => {
    delete process.env.LOCAL_LLM_ENABLED;
    delete process.env.OLLAMA_STANDBY;
    axiosGet.mockReset();
    axiosPost.mockReset();
  });

  afterEach(() => {
    if (savedEnabled === undefined) delete process.env.LOCAL_LLM_ENABLED;
    else process.env.LOCAL_LLM_ENABLED = savedEnabled;
    if (savedStandby === undefined) delete process.env.OLLAMA_STANDBY;
    else process.env.OLLAMA_STANDBY = savedStandby;
  });

  it("does not HTTP Ollama in standby (Qwen stays unloaded)", async () => {
    expect(await isOllamaAvailable()).toBe(false);
    expect(isOllamaConfigured()).toBe(false);
    expect(await generate("hello")).toBe("");
    expect(await chat([{ role: "user", content: "hi" }])).toBe("");
    expect(await embed("hi")).toEqual([]);
    expect(axiosGet).not.toHaveBeenCalled();
    expect(axiosPost).not.toHaveBeenCalled();
  });
});
