/**
 * obsidianMemory.ts — Obsidian vault integration for long-term memory.
 *
 * Reads/writes markdown files in an Obsidian vault.
 * The vault is synced via git between the VPS (bot) and the user's PC (Obsidian).
 *
 * Structure:
 *   vault/
 *     users/<userId>.md       — facts about each user
 *     knowledge/               — user-written notes (read-only for bot)
 *     conversations/           — conversation summaries (written by bot)
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import logger from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Vault paths
// ─────────────────────────────────────────────────────────────────────────────

function vaultDir(): string {
  return config.obsidianVaultPath;
}

function usersDir(): string {
  return path.join(vaultDir(), "users");
}

function knowledgeDir(): string {
  return path.join(vaultDir(), "knowledge");
}

function conversationsDir(): string {
  return path.join(vaultDir(), "conversations");
}

// ─────────────────────────────────────────────────────────────────────────────
// User notes (facts about each user)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a user markdown file and extract facts.
 * Format: lines starting with `- **key**: value #category`
 */
function parseUserFacts(content: string): Array<{ key: string; value: string; category: string }> {
  const facts: Array<{ key: string; value: string; category: string }> = [];
  const regex = /^- \*\*(.+?)\*\*:\s*(.+?)(?:\s+#(\w+))?$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    facts.push({
      key: match[1].trim(),
      value: match[2].trim(),
      category: match[3] || "info",
    });
  }
  return facts;
}

/**
 * Load facts about a user from their Obsidian note.
 */
export async function loadUserFacts(
  userId: string,
): Promise<Array<{ key: string; value: string; category: string }>> {
  if (!config.obsidianEnabled) return [];
  try {
    const filePath = path.join(usersDir(), `${userId}.md`);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8");
    return parseUserFacts(content);
  } catch (err) {
    logger.debug(
      `[Obsidian] Failed to load user facts for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Append a fact to a user's Obsidian note.
 * Creates the file if it doesn't exist.
 */
export async function appendUserFact(
  userId: string,
  username: string,
  key: string,
  value: string,
  category: string = "info",
): Promise<void> {
  if (!config.obsidianEnabled) return;
  try {
    const dir = usersDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${userId}.md`);
    const date = new Date().toISOString().split("T")[0];
    const line = `- **${key}**: ${value} #${category}\n`;

    if (fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, line, "utf-8");
    } else {
      const header = `---\nuserId: "${userId}"\nusername: "${username}"\ncreated: ${date}\nupdated: ${date}\n---\n\n# ${username}\n\n## Faits\n\n`;
      fs.writeFileSync(filePath, header + line, "utf-8");
    }
  } catch (err) {
    logger.debug(
      `[Obsidian] Failed to append fact for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Load free-form notes about a user (everything after "## Notes").
 */
export async function loadUserNotes(userId: string): Promise<string> {
  if (!config.obsidianEnabled) return "";
  try {
    const filePath = path.join(usersDir(), `${userId}.md`);
    if (!fs.existsSync(filePath)) return "";
    const content = fs.readFileSync(filePath, "utf-8");
    const notesMatch = content.match(/## Notes\n([\s\S]*?)$/m);
    return notesMatch?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge base (user-written notes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search the knowledge base for notes matching a query.
 * Simple keyword matching across all .md files.
 */
export async function searchKnowledge(query: string): Promise<string[]> {
  if (!config.obsidianEnabled) return [];
  try {
    const dir = knowledgeDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    const results: string[] = [];
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const lower = content.toLowerCase();
      const score = queryWords.filter((w) => lower.includes(w)).length;
      if (score > 0) {
        // Return first 500 chars of matching notes
        results.push(`[${file}]\n${content.slice(0, 500)}`);
      }
    }
    return results.slice(0, 5); // Max 5 notes
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation summaries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a conversation summary to the vault.
 */
export async function saveConversationSummary(
  userId: string,
  username: string,
  summary: string,
): Promise<void> {
  if (!config.obsidianEnabled) return;
  try {
    const dir = conversationsDir();
    fs.mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().split("T")[0];
    const filePath = path.join(dir, `${userId}-${date}.md`);
    const header = `---\nuserId: "${userId}"\nusername: "${username}"\ndate: ${date}\n---\n\n`;
    fs.writeFileSync(filePath, header + summary, "utf-8");
  } catch (err) {
    logger.debug(
      `[Obsidian] Failed to save conversation summary: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Git sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull latest changes from the vault repo.
 */
export async function syncVault(): Promise<void> {
  if (!config.obsidianEnabled) return;
  try {
    const { execSync } = await import("node:child_process");
    execSync("git pull origin main", {
      cwd: vaultDir(),
      stdio: "pipe",
      timeout: 10000,
    });
    logger.debug("[Obsidian] Vault synced");
  } catch {
    // Non-critical — vault may not have remote changes
  }
}

/**
 * Commit and push bot-written notes to the vault repo.
 */
export async function pushVault(): Promise<void> {
  if (!config.obsidianEnabled) return;
  try {
    const { execSync } = await import("node:child_process");
    const opts = { cwd: vaultDir(), stdio: "pipe" as const, timeout: 15000 };
    execSync("git add -A", opts);
    execSync('git commit -m "bot: update memory"', opts);
    execSync("git push origin main", opts);
    logger.debug("[Obsidian] Vault pushed");
  } catch {
    // Non-critical — nothing to commit or push failed
  }
}
