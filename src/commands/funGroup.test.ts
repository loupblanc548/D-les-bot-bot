import { describe, expect, it } from "vitest";
import { commands } from "./funGroup.js";
import { getNumberFact } from "../services/freeApis.js";

describe("fun slash commands", () => {
  it("keeps the non-joke fun subcommands and drops joke", () => {
    const fun = commands[0] as {
      options?: Array<{ name: string }>;
    };
    const names = (fun.options ?? []).map((o) => o.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "meme",
        "quote",
        "advice",
        "activity",
        "trivia",
        "8ball",
        "coinflip",
        "dice",
        "rps",
        "dog",
        "number-fact",
        "hackernews",
      ]),
    );
    expect(names).not.toContain("joke");
  });

  it("returns a number fact without the dead Numbers API", async () => {
    await expect(getNumberFact(7)).resolves.toMatch(/7/);
    await expect(getNumberFact("random")).resolves.toEqual(expect.any(String));
  });
});
