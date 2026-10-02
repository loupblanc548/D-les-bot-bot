import { describe, expect, it } from "vitest";
import { classifyTaskComplexity } from "./taskModelRouter.js";

describe("classifyTaskComplexity server actions", () => {
  it("routes a short purge order to a tool-capable tier", () => {
    expect(
      classifyTaskComplexity(
        "<@1512435587926200391> supprime tout les message du salon 1528085860677845143",
      ),
    ).toBe("moderate");
  });

  it("keeps a short chat on the light tier", () => {
    expect(classifyTaskComplexity("tu m'entends ?")).toBe("simple");
  });
});
