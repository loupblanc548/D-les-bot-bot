/**
 * trivialFastPath.test.ts
 */
import { describe, it, expect } from "vitest";
import { getTrivialResponse } from "./trivialFastPath.js";

describe("getTrivialResponse", () => {
  it("answers ultra-short acks without calling the LLM", () => {
    expect(getTrivialResponse("ok", "u1")).toBeTruthy();
    expect(getTrivialResponse("lol", "u1")).toBeTruthy();
    expect(getTrivialResponse("gg", "u1")).toBeTruthy();
    expect(getTrivialResponse("👍", "u1")).toBeTruthy();
  });

  it("does not canned-reply greetings, thanks, or identity questions", () => {
    expect(getTrivialResponse("salut", "u1")).toBeNull();
    expect(getTrivialResponse("bonjour", "u1")).toBeNull();
    expect(getTrivialResponse("merci", "u1")).toBeNull();
    expect(getTrivialResponse("ça va ?", "u1")).toBeNull();
    expect(getTrivialResponse("qui es-tu", "u1")).toBeNull();
    expect(getTrivialResponse("comment ça va", "u1")).toBeNull();
  });
});
