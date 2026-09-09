import { describe, expect, it } from "vitest";
import {
  NVIDIA_DEFAULT_MODEL,
  NVIDIA_TOOLS_MODEL,
  nvidiaModelSupportsTools,
  resolveNvidiaModel,
} from "./nvidiaNim.js";

describe("nvidiaNim model routing", () => {
  it("maps retired 70B ids onto the live chat model", () => {
    expect(resolveNvidiaModel("meta/llama-3.3-70b-instruct")).toBe(NVIDIA_DEFAULT_MODEL);
    expect(resolveNvidiaModel("nvidia/nemotron-3-nano-30b-a3b")).toBe(NVIDIA_DEFAULT_MODEL);
  });

  it("keeps the live tools model", () => {
    expect(resolveNvidiaModel(NVIDIA_TOOLS_MODEL)).toBe(NVIDIA_TOOLS_MODEL);
    expect(nvidiaModelSupportsTools(NVIDIA_TOOLS_MODEL)).toBe(true);
    expect(nvidiaModelSupportsTools(NVIDIA_DEFAULT_MODEL)).toBe(true);
  });
});
