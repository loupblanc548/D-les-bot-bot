import { describe, it, expect } from "vitest";
import { renderPrompt, getPrompt, listPrompts } from "./index.js";

describe("prompts registry", () => {
  it("lists registered prompts", () => {
    const names = listPrompts();
    expect(names).toContain("default");
    expect(names).toContain("moderation");
    expect(names).toContain("summary");
    expect(names).toContain("agent");
  });

  it("getPrompt returns prompt definition", () => {
    const prompt = getPrompt("default");
    expect(prompt).not.toBeNull();
    expect(prompt!.version).toBe("1.0.0");
    expect(prompt!.template).toContain("assistant");
  });

  it("getPrompt returns null for unknown", () => {
    expect(getPrompt("nonexistent")).toBeNull();
  });

  it("renderPrompt substitutes variables", () => {
    const rendered = renderPrompt("default", { context: "test context here" });
    expect(rendered).toContain("test context here");
  });

  it("renderPrompt returns empty for unknown prompt", () => {
    expect(renderPrompt("unknown")).toBe("");
  });

  it("renderPrompt handles missing variables gracefully", () => {
    const rendered = renderPrompt("default", {});
    expect(rendered).toContain("Contexte:");
  });
});
