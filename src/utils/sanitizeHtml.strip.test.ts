import { describe, expect, it } from "vitest";
import { stripAllHtml } from "./sanitizeHtml.js";

describe("stripAllHtml", () => {
  it("drops a closed tag and an unclosed tag", () => {
    expect(stripAllHtml("Hello <b>world</b>")).toBe("Hello world");
    expect(stripAllHtml("<script")).toBe("");
    expect(stripAllHtml("ok <script")).toBe("ok");
  });

  it("does not rebuild a tag from a decoded entity", () => {
    expect(stripAllHtml("&lt;script&gt;alert")).toBe("scriptalert");
    expect(stripAllHtml("a &lt; b")).toBe("a b");
  });
});
