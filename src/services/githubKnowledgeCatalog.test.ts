import { describe, it, expect } from "vitest";
import {
  GITHUB_CATALOG,
  matchGithubCatalog,
  knowledgeRepos,
  releaseRepos,
  githubKnowledgePromptBlock,
} from "./githubKnowledgeCatalog.js";

describe("githubKnowledgeCatalog", () => {
  it("has unique owner/repo pairs", () => {
    const keys = GITHUB_CATALOG.map((e) => `${e.owner}/${e.repo}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not track dead Switch emulators", () => {
    const names = GITHUB_CATALOG.map((e) => `${e.owner}/${e.repo}`.toLowerCase());
    expect(names).not.toContain("yuzu-emu/yuzu");
    expect(names).not.toContain("ryujinx/ryujinx");
  });

  it("matches OSINT and Fortnite queries to the right repos", () => {
    const osint = matchGithubCatalog("cherche un pseudo avec sherlock");
    expect(osint.some((r) => r.repo === "sherlock")).toBe(true);

    const fn = matchGithubCatalog("API boutique fortnite");
    expect(fn.some((r) => r.owner === "Fortnite-API")).toBe(true);

    const hd = matchGithubCatalog("helldivers 2 guerre galactique");
    expect(hd.some((r) => r.domain === "helldivers")).toBe(true);
  });

  it("indexes knowledge repos and tracks releases separately", () => {
    expect(knowledgeRepos().length).toBeGreaterThan(30);
    expect(releaseRepos().length).toBeGreaterThan(20);
    expect(releaseRepos().every((r) => r.trackReleases)).toBe(true);
  });

  it("tells the agent when to use the catalog", () => {
    const block = githubKnowledgePromptBlock();
    expect(block).toContain("lookupKnowledgeRepo");
    expect(block).toContain("searchKnowledge");
  });
});
