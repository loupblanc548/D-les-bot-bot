/**
 * aiHotPatcher.test.ts — Tests du AI Hot-Patching System
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logs.js", () => ({ createLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("../utils/hot-reload.js", () => ({
  reloadModule: vi.fn().mockResolvedValue({}),
  fullReload: vi.fn().mockResolvedValue({
    commands: { success: 0, failed: 0 },
    services: { success: 0, failed: 0 },
    registered: true,
  }),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("original content\n"),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
}));

import {
  detectIssue,
  generatePatch,
  validatePatch,
  getPatch,
  getAllPatches,
  getPatchesByStatus,
  clearPatchStore,
  buildPatchEmbed,
  verifyPatch,
} from "./aiHotPatcher.js";

describe("AI Hot-Patcher", () => {
  beforeEach(() => {
    clearPatchStore();
    vi.clearAllMocks();
  });

  describe("detectIssue", () => {
    it("détecte un issue depuis un log d'erreur", () => {
      const issue = detectIssue(
        "TypeError: Cannot read property 'x' of undefined\n    at Object.handler (src/commands/test.ts:42:15)",
        "testCron",
      );
      expect(issue.id).toMatch(/^issue_/);
      expect(issue.source).toBe("testCron");
      expect(issue.affectedFile).toContain("test.ts");
    });

    it("fallback vers unknown si pas de stack trace", () => {
      const issue = detectIssue("Something went wrong", "testCron");
      expect(issue.affectedFile).toBe("unknown");
    });
  });

  describe("generatePatch", () => {
    it("génère un patch avec diff", async () => {
      const issue = detectIssue("Error in src/services/test.ts", "test");
      const patch = await generatePatch(issue, "FIX", "Fix the null reference", "fixed content\n");
      expect(patch.id).toMatch(/^patch_/);
      expect(patch.type).toBe("FIX");
      expect(patch.status).toBe("PROPOSED");
      expect(patch.diff).toContain("fixed content");
    });
  });

  describe("validatePatch", () => {
    it("valide un patch correct", async () => {
      const issue = detectIssue("Error in src/services/test.ts", "test");
      const patch = await generatePatch(issue, "FIX", "Fix", "new content\n");
      const result = validatePatch(patch);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejette un patch vide", async () => {
      const issue = detectIssue("Error", "test");
      const patch = await generatePatch(issue, "FIX", "Fix", "");
      const result = validatePatch(patch);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Le contenu patché est vide");
    });

    it("détecte les patterns dangereux", async () => {
      const issue = detectIssue("Error", "test");
      const patch = await generatePatch(issue, "FIX", "Fix", "const x = eval('1+1');");
      const result = validatePatch(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("eval"))).toBe(true);
    });
  });

  describe("verifyPatch", () => {
    it("vérifie un patch appliqué", async () => {
      const issue = detectIssue("Error", "test");
      const patch = await generatePatch(issue, "FIX", "Fix", "content\n");
      // Simuler le statut APPLIED
      patch.status = "APPLIED";
      const verified = verifyPatch(patch.id);
      expect(verified).not.toBeNull();
      expect(verified?.status).toBe("VERIFIED");
      expect(verified?.verifiedAt).not.toBeNull();
    });

    it("retourne null pour un patch non appliqué", async () => {
      const issue = detectIssue("Error", "test");
      const patch = await generatePatch(issue, "FIX", "Fix", "content\n");
      const result = verifyPatch(patch.id);
      expect(result).toBeNull();
    });
  });

  describe("Patch Store", () => {
    it("getPatch retourne un patch par ID", async () => {
      const issue = detectIssue("Error", "test");
      const patch = await generatePatch(issue, "FIX", "Fix", "content\n");
      expect(getPatch(patch.id)).not.toBeNull();
    });

    it("getAllPatches retourne tous les patches", async () => {
      const issue = detectIssue("Error", "test");
      await generatePatch(issue, "FIX", "Fix", "content\n");
      await generatePatch(issue, "HOTFIX", "Fix2", "content2\n");
      expect(getAllPatches()).toHaveLength(2);
    });

    it("getPatchesByStatus filtre par statut", async () => {
      const issue = detectIssue("Error", "test");
      await generatePatch(issue, "FIX", "Fix", "content\n");
      expect(getPatchesByStatus("PROPOSED")).toHaveLength(1);
      expect(getPatchesByStatus("APPLIED")).toHaveLength(0);
    });
  });

  describe("buildPatchEmbed", () => {
    it("génère un embed", async () => {
      const issue = detectIssue("Error", "test");
      const patch = await generatePatch(issue, "FIX", "Fix description", "content\n");
      const embed = buildPatchEmbed(patch);
      expect(embed).toBeDefined();
    });
  });
});
