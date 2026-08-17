import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  nvidiaAvailable: false,
  omnirouteAvailable: false,
}));

vi.mock("../config.js", () => ({
  config: {
    openRouterApiKey: "test-openrouter-key",
    openRouterModel: "configured/model",
  },
}));

vi.mock("./nvidiaNim.js", () => ({
  NVIDIA_FREE_MODELS: ["nvidia/test-model"],
  isNvidiaNimAvailable: () => state.nvidiaAvailable,
}));

vi.mock("./omniroute.js", () => ({
  OMNIROUTE_FREE_MODELS: ["if/test-model"],
  isOmnirouteAvailable: () => state.omnirouteAvailable,
}));

vi.mock("./prometheusExporter.js", () => ({
  agentCircuitBreakerTransitions: {
    labels: () => ({ inc: vi.fn() }),
  },
}));

vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  getAllAvailableModels,
  getAvailableCheapModels,
  getAvailableFreeModels,
  claimModel,
  releaseModel,
  markModelFailure,
} from "./modelRotation.js";

describe("model rotation provider selection", () => {
  beforeEach(() => {
    state.nvidiaAvailable = false;
    state.omnirouteAvailable = false;
  });

  it("only exposes configured providers", () => {
    const openRouterOnly = getAvailableFreeModels();
    expect(openRouterOnly[0]).toBe("configured/model");
    expect(openRouterOnly).not.toContain("nvidia/test-model");
    expect(openRouterOnly).not.toContain("if/test-model");

    state.nvidiaAvailable = true;
    state.omnirouteAvailable = true;

    const allProviders = getAvailableFreeModels();
    expect(allProviders).toContain("configured/model");
    expect(allProviders).toContain("nvidia/test-model");
    expect(allProviders).toContain("if/test-model");
  });

  it("does not allow two requests to claim the same model concurrently", () => {
    const model = getAvailableFreeModels()[0];
    expect(model).toBeDefined();

    expect(claimModel(model)).toBe(true);
    expect(claimModel(model)).toBe(false);

    releaseModel(model);
    expect(claimModel(model)).toBe(true);
    releaseModel(model);
  });

  it("does not retry a cooled-down model for tool calls", () => {
    for (const model of getAvailableFreeModels()) {
      markModelFailure(model, true);
    }
    for (const model of getAvailableCheapModels()) {
      markModelFailure(model, true);
    }

    expect(getAllAvailableModels(true)).toEqual([]);
    expect(getAllAvailableModels(false)).toEqual(["openrouter/auto"]);
  });
});
