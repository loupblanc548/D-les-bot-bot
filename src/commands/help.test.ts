import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../commands/main.js";

// ─── All registered top-level slash commands (from setName() across command files) ───
// These are the command names as they appear in Discord (e.g., /help, /status).
// Any new command added to the bot MUST also be added here AND appear in CATEGORIES.
const REGISTERED_COMMANDS = new Set([
  // Principales
  "start",
  "help",
  "restart",
  "status",
  "uptime",
  "userinfo",
  "server-info",
  "dashboard",
  "debug",
  "hotreload",
  // Surveillance
  "sources",
  "add-source",
  "remove-source",
  "pause-source",
  "list-sources",
  "source-stats",
  "rss-test",
  "reddit-track",
  "rss-custom",
  "twitch",
  "psn",
  "scraper-status",
  "search-notifications",
  "test-freegames",
  "test-rss",
  // Administration
  "broadcast",
  "dm",
  "deletehistory",
  "maintenance",
  "clean-duplicates",
  "backup",
  "permission-audit",
  "guild-config",
  "cooldown-config",
  "channel-routing",
  "purge-content",
  "api-status",
  "bot-health",
  "healthz",
  "create-workflow",
  "list-workflows",
  "toggle-workflow",
  // IA
  "ai",
  // AlertCenter
  "alert",
  "alertcenter",
  "alertconfig",
  "alert-rules",
  "smart-alerts",
  "security-audit",
  "riskscore",
  "riskyusers",
  "spam-analysis",
  "auto-report",
  "viral-alert",
  "trend-report",
  // Modération
  "mod",
  "report",
  "ban",
  "kick",
  "mute",
  "unmute",
  "warn",
  "clear",
  "timeout",
  "unlock",
  "lock",
  "slowmode",
  "softban",
  "tempban",
  "purge",
  "purgeuser",
  "snipe",
  "mass-move",
  "voice-kick",
  // Sécurité
  "security",
  "raid-shield",
  "ban-log",
  "behavior-timeline",
  "alt-link",
  "namehistory",
  "avatarhistory",
  "linkcheck",
  // OSINT / Shadow
  "shadow",
  // Gaming
  "game-status",
  "game-info",
  "free-games",
  "free-game-reminder",
  "patch_notes",
  "deal",
  "deals-history",
  "track",
  "track-game",
  "untrack-game",
  "list-tracked",
  "steam",
  "steam-deals",
  "wishlist",
  "wishlist-stats",
  "wishlist-notify",
  "boutique",
  "fortnite-wishlist",
  "fortnite-shop-preview",
  "xbox",
  "price-compare",
  "price-history",
  "price-track",
  "release-calendar",
  "gaming-news",
  "epic-calendar",
  // Communauté
  "ticket-setup",
  "self-role",
  "profile",
  // Utilitaires
  "embed-builder",
  "say",
  "vocal",
  "mp3",
  "tts",
  "recherche",
  "audio-effects",
  "radio-stop",
  // Casier
  "casier",
  "casier-clear",
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
