import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetQaIndexCache, saveQA, searchQA } from "./obsidianMemory.js";

describe("obsidianMemory Q&A index", () => {
  let vault: string;
  const prev = process.env.OBSIDIAN_VAULT_PATH;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-qa-"));
    process.env.OBSIDIAN_VAULT_PATH = vault;
    resetQaIndexCache();
  });

  afterEach(() => {
    resetQaIndexCache();
    if (prev === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = prev;
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("saves a Q&A and finds it again without scanning every file", async () => {
    await saveQA("Qu'est-ce que Docker ?", "Docker est un outil de conteneurs.", "tech");
    const hit = await searchQA("Docker");
    expect(hit).not.toBeNull();
    expect(hit?.answer).toContain("conteneurs");
    expect(hit?.category).toBe("tech");
    expect(fs.existsSync(path.join(vault, "qa", ".qa-index.json"))).toBe(true);
  });

  it("returns null when nothing in the vault matches", async () => {
    await saveQA("Qu'est-ce que Docker ?", "Un runtime de conteneurs.", "tech");
    expect(await searchQA("recette de tartiflette savoyarde")).toBeNull();
  });
});
