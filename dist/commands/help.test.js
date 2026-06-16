"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const main_1 = require("../commands/main");
// ─── All registered top-level slash commands (from setName() across command files) ───
// These are the command names as they appear in Discord (e.g., /help, /status).
// Any new command added to the bot MUST also be added here AND appear in CATEGORIES.
const REGISTERED_COMMANDS = new Set([
    // Principales
    "start", "help", "status", "restart", "retro", "retrospective", "debug", "hotreload",
    // Surveillance
    "addsource", "removesource", "listsources", "twitch", "psn",
    // Administration
    "broadcast", "dm", "logs", "deletehistory", "maintenance",
    // IA
    "chat", "mention", "aichat", "smartpoll", "translate", "summarize", "ask-gaming", "ask-tech",
    // AlertCenter
    "alertcenter", "riskscore", "riskyusers", "alertconfig",
    // Moderation
    "warn", "mute", "unmute", "kick", "ban", "timeout", "clear", "lock", "unlock",
    "softban", "purge", "slowmode", "snipe", "history", "purgeuser", "tempban",
    // Securite
    "lockdown", "nuke", "check-alt", "blacklist", "role-mass", "antiraid", "verif",
    "namehistory", "avatarhistory", "linkcheck", "antiphishing",
    // Gaming
    "game-status", "free-games", "patch-notes", "deal", "steam",
    "track-game", "untrack-game", "list-tracked", "wishlist",
    // Communaute
    "reminder", "ticket-setup", "wishlist-notify", "poll",
    // Utilitaires
    "embed-builder", "say", "vocal", "mp3", "dictee", "reverse",
    // Casier
    "casier", "casier-clear",
    // Fun
    "echo-tds", "ask-bot", "shop",
]);
/**
 * Extracts all command names from a CATEGORIES.commands string.
 * Format: `/commandname - description` or `/commandname [params] - description`
 */
function extractCommands(commandsString) {
    const matches = commandsString.matchAll(/`\/([a-zA-Z][a-zA-Z0-9_-]*)/g);
    return Array.from(matches, (m) => m[1]);
}
(0, vitest_1.describe)("Command /help - Categories coverage", () => {
    (0, vitest_1.it)("should have at least one category defined", () => {
        (0, vitest_1.expect)(main_1.CATEGORIES.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("should have every registered command appear in at least one category", () => {
        // Collect all command names mentioned across all categories
        const allCategoryCommands = new Set();
        for (const cat of main_1.CATEGORIES) {
            const cmds = extractCommands(cat.commands);
            for (const cmd of cmds) {
                allCategoryCommands.add(cmd);
            }
        }
        const missingCommands = [];
        for (const cmd of REGISTERED_COMMANDS) {
            if (!allCategoryCommands.has(cmd)) {
                missingCommands.push(cmd);
            }
        }
        (0, vitest_1.expect)(missingCommands).toEqual([]);
    });
    (0, vitest_1.it)("should not have duplicate commands across categories", () => {
        const seen = new Map(); // cmd -> [categoryIds]
        for (const cat of main_1.CATEGORIES) {
            const cmds = extractCommands(cat.commands);
            for (const cmd of cmds) {
                if (!seen.has(cmd)) {
                    seen.set(cmd, []);
                }
                seen.get(cmd).push(cat.id);
            }
        }
        const duplicates = [];
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
        (0, vitest_1.expect)(duplicates).toEqual([]);
    });
    (0, vitest_1.it)("should not have orphaned commands in categories (not registered)", () => {
        const allCategoryCommands = new Set();
        for (const cat of main_1.CATEGORIES) {
            const cmds = extractCommands(cat.commands);
            for (const cmd of cmds) {
                allCategoryCommands.add(cmd);
            }
        }
        const orphaned = [];
        for (const cmd of allCategoryCommands) {
            if (!REGISTERED_COMMANDS.has(cmd)) {
                // Exclude commands with params that might have been parsed differently
                // Example: "/retrospective [type] [limite]" -> we extract "retrospective"
                orphaned.push(cmd);
            }
        }
        (0, vitest_1.expect)(orphaned).toEqual([]);
    });
    (0, vitest_1.it)("should have a non-empty description for each category", () => {
        for (const cat of main_1.CATEGORIES) {
            (0, vitest_1.expect)(cat.description, cat.id + " description should not be empty").toBeTruthy();
        }
    });
    (0, vitest_1.it)("should have at least one command in each category", () => {
        for (const cat of main_1.CATEGORIES) {
            const cmds = extractCommands(cat.commands);
            (0, vitest_1.expect)(cmds.length, cat.id + " should have at least one command").toBeGreaterThan(0);
        }
    });
});
//# sourceMappingURL=help.test.js.map