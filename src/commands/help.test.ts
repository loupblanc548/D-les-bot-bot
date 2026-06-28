import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../commands/main.js";

// ─── All registered top-level slash commands (from setName() across command files) ───
// These are the command names as they appear in Discord (e.g., /help, /status).
// Any new command added to the bot MUST also be added here AND appear in CATEGORIES.
const REGISTERED_COMMANDS = new Set([
  // Commandes top-level (groupes avec sous-commandes)
  "bot",
  "sources",
  "admin",
  "ai",
  "alert",
  "mod",
  "security",
  "shadow",
  "game",
  "community",
  "tools",
  "casier",
]);

/**
 * Extracts all command names from a CATEGORIES.commands string.
 * Format: `/commandname - description` or `/commandname [params] - description`
 */
function extractCommands(commandsString: string): string[] {
  const matches = commandsString.matchAll(/`\/([a-zA-Z0-9][a-zA-Z0-9_-]*)/g);
  return Array.from(matches, (m) => m[1]);
}

describe("Command /help - Categories coverage", () => {
  it("should have at least one category defined", () => {
    expect(CATEGORIES.length).toBeGreaterThan(0);
  });

  it("should have every registered command appear in at least one category", () => {
    // Collect all command names mentioned across all categories
    const allCategoryCommands = new Set<string>();
    for (const cat of CATEGORIES) {
      const cmds = extractCommands(cat.commands);
      for (const cmd of cmds) {
        allCategoryCommands.add(cmd);
      }
    }

    const missingCommands: string[] = [];
    for (const cmd of REGISTERED_COMMANDS) {
      if (!allCategoryCommands.has(cmd)) {
        missingCommands.push(cmd);
      }
    }

    expect(missingCommands).toEqual([]);
  });

  it("should not have duplicate commands across categories", () => {
    const seen = new Map<string, string[]>(); // cmd -> [categoryIds]

    for (const cat of CATEGORIES) {
      const cmds = extractCommands(cat.commands);
      // Dedup within the same category (subcommands like /sources add, /sources remove count as one)
      const uniqueCmds = new Set(cmds);
      for (const cmd of uniqueCmds) {
        if (!seen.has(cmd)) {
          seen.set(cmd, []);
        }
        seen.get(cmd)!.push(cat.id);
      }
    }

    const duplicates: string[] = [];
    for (const [cmd, catIds] of seen) {
      if (catIds.length > 1) {
        // Some commands legitimately appear in multiple categories (e.g., translate in both IA and Utilitaires)
        // We exclude known intentional duplicates
        const intentionalDupes = new Set(["translate", "poll", "alertcenter"]);
        if (!intentionalDupes.has(cmd)) {
          duplicates.push(cmd + " appears in: " + catIds.join(", "));
        }
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("should not have orphaned commands in categories (not registered)", () => {
    const allCategoryCommands = new Set<string>();
    for (const cat of CATEGORIES) {
      const cmds = extractCommands(cat.commands);
      for (const cmd of cmds) {
        allCategoryCommands.add(cmd);
      }
    }

    const orphaned: string[] = [];
    for (const cmd of allCategoryCommands) {
      if (!REGISTERED_COMMANDS.has(cmd)) {
        // Exclude commands with params that might have been parsed differently
        // Example: "/retrospective [type] [limite]" -> we extract "retrospective"
        orphaned.push(cmd);
      }
    }

    expect(orphaned).toEqual([]);
  });

  it("should have a non-empty description for each category", () => {
    for (const cat of CATEGORIES) {
      expect(cat.description, cat.id + " description should not be empty").toBeTruthy();
    }
  });

  it("should have at least one command in each category", () => {
    for (const cat of CATEGORIES) {
      const cmds = extractCommands(cat.commands);
      expect(cmds.length, cat.id + " should have at least one command").toBeGreaterThan(0);
    }
  });
});
