import { afterEach, describe, expect, it } from "vitest";
import { isLocalLlmEnabled, isOllamaStandby, shouldUseLocalOllama } from "./localLlmGate.js";

describe("localLlmGate", () => {
  const savedEnabled = process.env.LOCAL_LLM_ENABLED;
  const savedStandby = process.env.OLLAMA_STANDBY;

  afterEach(() => {
    if (savedEnabled === undefined) delete process.env.LOCAL_LLM_ENABLED;
    else process.env.LOCAL_LLM_ENABLED = savedEnabled;
    if (savedStandby === undefined) delete process.env.OLLAMA_STANDBY;
    else process.env.OLLAMA_STANDBY = savedStandby;
  });

  it("defaults to standby when nothing is set (Qwen stays on disk)", () => {
    const env = {};
    expect(isLocalLlmEnabled(env)).toBe(false);
    expect(isOllamaStandby(env)).toBe(true);
    expect(shouldUseLocalOllama(env)).toBe(false);
  });

  it("stays in standby when LOCAL_LLM_ENABLED is false", () => {
    const env = { LOCAL_LLM_ENABLED: "false" };
    expect(shouldUseLocalOllama(env)).toBe(false);
    expect(isOllamaStandby(env)).toBe(true);
  });

  it("wakes Ollama when LOCAL_LLM_ENABLED is true (Llama install later)", () => {
    expect(shouldUseLocalOllama({ LOCAL_LLM_ENABLED: "true" })).toBe(true);
    expect(shouldUseLocalOllama({ LOCAL_LLM_ENABLED: "1" })).toBe(true);
    expect(shouldUseLocalOllama({ LOCAL_LLM_ENABLED: "yes" })).toBe(true);
    expect(isOllamaStandby({ LOCAL_LLM_ENABLED: "true" })).toBe(false);
  });

  it("keeps standby if OLLAMA_STANDBY=true even when local is enabled", () => {
    const env = { LOCAL_LLM_ENABLED: "true", OLLAMA_STANDBY: "true" };
    expect(isOllamaStandby(env)).toBe(true);
    expect(shouldUseLocalOllama(env)).toBe(false);
  });

  it("uses Ollama only when enabled and standby is explicitly off", () => {
    const env = { LOCAL_LLM_ENABLED: "true", OLLAMA_STANDBY: "false" };
    expect(isOllamaStandby(env)).toBe(false);
    expect(shouldUseLocalOllama(env)).toBe(true);
  });

  it("does not use Ollama when standby is off but local is not enabled", () => {
    const env = { LOCAL_LLM_ENABLED: "false", OLLAMA_STANDBY: "false" };
    expect(shouldUseLocalOllama(env)).toBe(false);
  });
});
