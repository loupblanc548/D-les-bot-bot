import { describe, expect, it } from "vitest";
import { commands } from "../commands/funGroup.js";
import {
  buildJokeApiUrl,
  JOKE_CATEGORIES,
  normalizeJokeCategory,
  normalizeJokeLang,
  normalizeJokeStyle,
} from "./jokes.js";

describe("joke options", () => {
  it("normalizes category, lang and style", () => {
    expect(normalizeJokeCategory("programming")).toBe("programming");
    expect(normalizeJokeCategory("nope")).toBe("any");
    expect(normalizeJokeLang(undefined)).toBe("fr");
    expect(normalizeJokeLang("EN")).toBe("en");
    expect(normalizeJokeStyle("one-liner")).toBe("single");
    expect(normalizeJokeStyle("setup")).toBe("twopart");
    expect(JOKE_CATEGORIES).toContain("chuck");
  });

  it("builds JokeAPI URLs with language, safe-mode and style", () => {
    expect(buildJokeApiUrl("programming", "fr", "any")).toBe(
      "https://v2.jokeapi.dev/joke/Programming?lang=fr&safe-mode",
    );
    expect(buildJokeApiUrl("pun", "en", "twopart")).toBe(
      "https://v2.jokeapi.dev/joke/Pun?lang=en&safe-mode&type=twopart",
    );
    expect(buildJokeApiUrl("dad", "fr", "single")).toBe(
      "https://v2.jokeapi.dev/joke/Pun?lang=fr&safe-mode&type=single",
    );
    expect(buildJokeApiUrl("chuck", "en", "any")).toBeNull();
    expect(buildJokeApiUrl("knock-knock", "en", "any")).toBeNull();
  });

  it("exposes categorie, langue and style on /fun joke", () => {
    const fun = commands[0] as {
      options?: Array<{
        name: string;
        options?: Array<{ name: string; choices?: Array<{ value: string }> }>;
      }>;
    };
    const joke = fun.options?.find((o) => o.name === "joke");
    const names = (joke?.options ?? []).map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(["categorie", "langue", "style"]));
    const categorie = joke?.options?.find((o) => o.name === "categorie");
    expect(categorie?.choices?.map((c) => c.value)).toEqual(
      expect.arrayContaining(["programming", "dad", "chuck", "knock-knock", "pun"]),
    );
  });
});
