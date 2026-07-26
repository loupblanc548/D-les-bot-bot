import { describe, it, expect } from "vitest";
import {
  normalizeText,
  truncate,
  capitalize,
  kebabCase,
  pluralize,
  sanitizeMarkdownDiscord,
  wordCount,
} from "./string.js";

describe("string utils", () => {
  it("normalizeText collapses whitespace", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world");
  });

  it("truncate adds suffix", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("truncate returns full if short enough", () => {
    expect(truncate("hi", 10)).toBe("hi");
  });

  it("capitalize first letter", () => {
    expect(capitalize("hello")).toBe("Hello");
    expect(capitalize("")).toBe("");
  });

  it("kebabCase converts camelCase and spaces", () => {
    expect(kebabCase("helloWorld")).toBe("hello-world");
    expect(kebabCase("Hello World")).toBe("hello-world");
    expect(kebabCase("some_long_name")).toBe("some-long-name");
  });

  it("pluralize basic rules", () => {
    expect(pluralize("chat", 1)).toBe("chat");
    expect(pluralize("chat", 2)).toBe("chats");
    expect(pluralize("animal", 2)).toBe("animaux");
    expect(pluralize("bateau", 2)).toBe("bateaux");
  });

  it("sanitizeMarkdownDiscord escapes formatting chars", () => {
    expect(sanitizeMarkdownDiscord("**bold**")).toBe("\\*\\*bold\\*\\*");
    expect(sanitizeMarkdownDiscord("`code`")).toBe("\\`code\\`");
  });

  it("wordCount counts words", () => {
    expect(wordCount("hello world foo")).toBe(3);
    expect(wordCount("  ")).toBe(0);
  });
});
