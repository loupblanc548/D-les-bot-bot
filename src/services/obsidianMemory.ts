/**
 * obsidianMemory.ts — Obsidian vault integration for long-term memory.
 *
 * Reads/writes markdown files in an Obsidian vault.
 * The vault is synced via git between the VPS (bot) and the user's PC (Obsidian).
 *
 * Structure:
 *   vault/
 *     qa/                     — Q&A pairs (question + answer) organized by category
 *       <category>/
 *         <slug>.md           — One file per Q&A, slugified from the question
 *     users/<userId>.md       — facts about each user
 *     knowledge/              — user-written notes (read-only for bot)
 *     conversations/          — conversation summaries (written by bot)
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

function qaDir(): string {
  return path.join(vaultDir(), "qa");
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Slugify a string into a safe filename (max 60 chars). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Normalize text for comparison (lowercase, no accents, no punctuation). */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract significant words from a query (stop words filtered, length > 2). */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "de",
    "du",
    "et",
    "or",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "que",
    "qui",
    "dans",
    "pour",
    "sur",
    "avec",
    "sans",
    "par",
    "ce",
    "cette",
    "ces",
    "mon",
    "ma",
    "mes",
    "ton",
    "ta",
    "tes",
    "son",
    "sa",
    "ses",
    "notre",
    "votre",
    "leur",
    "leurs",
    "comment",
    "quoi",
    "quel",
    "quelle",
    "quand",
    "où",
    "where",
    "when",
    "what",
    "which",
    "why",
    "how",
    "est",
    "sont",
    "pas",
    "ne",
    "ni",
    "mais",
    "donc",
    "car",
    "then",
    "than",
    "this",
    "that",
    "these",
    "those",
    "you",
    "your",
    "je",
    "tu",
    "il",
    "elle",
    "on",
    "nous",
    "vous",
    "ils",
    "elles",
    "it",
    "they",
    "we",
    "i",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "for",
    "from",
    "with",
    "about",
    "as",
    "into",
    "like",
    "through",
    "after",
    "over",
    "between",
    "out",
    "against",
    "during",
    "without",
    "before",
    "under",
    "around",
    "among",
    "est",
    "ce",
    "ca",
    "ça",
    "oui",
    "non",
    "yes",
    "no",
    "not",
  ]);
  return normalizeText(text)
    .split(" ")
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/** Calculate a simple relevance score between a query and a stored question. */
function relevanceScore(queryKeywords: string[], storedText: string): number {
  const storedLower = normalizeText(storedText);
  let score = 0;
  for (const kw of queryKeywords) {
    if (storedLower.includes(kw)) score++;
  }
  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q&A persistence — "tiroirs" organized by category
// ─────────────────────────────────────────────────────────────────────────────

export interface SavedQA {
  question: string;
  answer: string;
  category: string;
  filePath: string;
}

/**
 * Determine the category ("tiroir") for a Q&A pair based on the question content.
 */
function categorizeQuestion(question: string): string {
  const q = normalizeText(question);
  const categories: Array<{ name: string; keywords: string[] }> = [
    {
      name: "gaming",
      keywords: [
        "jeu",
        "game",
        "play",
        "steam",
        "ps5",
        "xbox",
        "nintendo",
        "minecraft",
        "fortnite",
        "helldivers",
        "valorant",
        "league",
        "lol",
        "gaming",
        "jeux",
      ],
    },
    {
      name: "tech",
      keywords: [
        "code",
        "programmation",
        "typescript",
        "javascript",
        "python",
        "node",
        "react",
        "bug",
        "erreur",
        "error",
        "compile",
        "docker",
        "linux",
        "server",
        "api",
        "database",
        "sql",
      ],
    },
    {
      name: "web",
      keywords: [
        "site",
        "web",
        "internet",
        "url",
        "lien",
        "google",
        "search",
        "recherche",
        "navigateur",
        "browser",
      ],
    },
    {
      name: "osint",
      keywords: [
        "osint",
        "ip",
        "scan",
        "port",
        "dns",
        "whois",
        "security",
        "securite",
        "pentest",
        "hack",
        "vulnerability",
      ],
    },
    {
      name: "crypto",
      keywords: [
        "crypto",
        "bitcoin",
        "btc",
        "eth",
        "ethereum",
        "price",
        "prix",
        "trading",
        "blockchain",
        "token",
      ],
    },
    {
      name: "meteo",
      keywords: [
        "meteo",
        "weather",
        "temperature",
        "pluie",
        "rain",
        "neige",
        "snow",
        "vent",
        "wind",
      ],
    },
    {
      name: "discord",
      keywords: [
        "discord",
        "serveur",
        "server",
        "channel",
        "salon",
        "role",
        "rôle",
        "ban",
        "kick",
        "moderation",
      ],
    },
    {
      name: "culture",
      keywords: [
        "film",
        "movie",
        "serie",
        "series",
        "music",
        "musique",
        "book",
        "livre",
        "art",
        "history",
        "histoire",
      ],
    },
    {
      name: "science",
      keywords: [
        "science",
        "physics",
        "physique",
        "chimie",
        "chemistry",
        "biologie",
        "biology",
        "math",
        "maths",
        "mathematiques",
      ],
    },
    {
      name: "quotidien",
      keywords: [
        "recette",
        "recipe",
        "cooking",
        "cuisine",
        "food",
        "nourriture",
        "sante",
        "health",
        "sport",
        "exercise",
      ],
    },
  ];

  let bestCategory = "divers";
  let bestScore = 0;

  for (const cat of categories) {
    const score = cat.keywords.filter((kw) => q.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat.name;
    }
  }

  return bestCategory;
}

/**
 * Search for a previously answered question that matches the current query.
 * Returns the best matching Q&A if the relevance score is high enough.
 */
export async function searchQA(query: string): Promise<SavedQA | null> {
  if (!config.obsidianEnabled) return null;
  try {
    const baseDir = qaDir();
    if (!fs.existsSync(baseDir)) return null;

    const queryKeywords = extractKeywords(query);
    if (queryKeywords.length === 0) return null;

    let bestMatch: SavedQA | null = null;
    let bestScore = 0;

    // Scan all category subdirectories
    const categories = fs
      .readdirSync(baseDir)
      .filter((f) => fs.statSync(path.join(baseDir, f)).isDirectory());

    for (const category of categories) {
      const catDir = path.join(baseDir, category);
      const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".md"));

      for (const file of files) {
        const filePath = path.join(catDir, file);
        const content = fs.readFileSync(filePath, "utf-8");

        // Extract the question from the "## Question" section
        const qMatch = content.match(/## Question\n([\s\S]*?)(?=\n## )/);
        if (!qMatch) continue;

        const storedQuestion = qMatch[1].trim();
        const score = relevanceScore(queryKeywords, storedQuestion);

        // Require at least 60% keyword overlap to be considered a match
        const threshold = Math.ceil(queryKeywords.length * 0.6);
        if (score >= threshold && score > bestScore) {
          bestScore = score;
          const aMatch = content.match(/## Réponse\n([\s\S]*?)(?=\n## |\n---|\Z)/);
          bestMatch = {
            question: storedQuestion,
            answer: aMatch?.[1]?.trim() || "",
            category,
            filePath,
          };
        }
      }
    }

    if (bestMatch) {
      logger.info(`[Obsidian] Q&A trouvé dans "${bestMatch.category}" (score: ${bestScore})`);
    }
    return bestMatch;
  } catch (err) {
    logger.debug(`[Obsidian] searchQA error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Save a Q&A pair to the vault, organized by category ("tiroir").
 * Skips if the same question already exists.
 */
export async function saveQA(question: string, answer: string, category?: string): Promise<void> {
  if (!config.obsidianEnabled) return;
  try {
    const cat = category || categorizeQuestion(question);
    const dir = path.join(qaDir(), cat);
    fs.mkdirSync(dir, { recursive: true });

    const slug = slugify(question);
    const filePath = path.join(dir, `${slug}.md`);

    // Don't overwrite if already exists
    if (fs.existsSync(filePath)) {
      // Update the answer if it's different (append new answer version)
      const existing = fs.readFileSync(filePath, "utf-8");
      const aMatch = existing.match(/## Réponse\n([\s\S]*?)(?=\n## )/);
      if (aMatch && aMatch[1].trim() === answer.trim()) {
        return; // Same answer, skip
      }
      // Append as a new answer version
      const date = new Date().toISOString().split("T")[0];
      const updateBlock = `\n\n---\n\n## Réponse (mise à jour ${date})\n${answer}\n`;
      fs.appendFileSync(filePath, updateBlock, "utf-8");
      logger.debug(`[Obsidian] Q&A updated: ${cat}/${slug}`);
      return;
    }

    const date = new Date().toISOString().split("T")[0];
    const content = `---
category: "${cat}"
created: ${date}
---

# ${question.slice(0, 80)}

## Question

${question}

## Réponse

${answer}

## Métadonnées

- Catégorie: **${cat}**
- Date: ${date}
- Source: conversation Discord
`;

    fs.writeFileSync(filePath, content, "utf-8");
    logger.info(`[Obsidian] Q&A sauvegardé dans "${cat}/${slug}.md"`);
  } catch (err) {
    logger.debug(`[Obsidian] saveQA error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * List all Q&A categories with counts (for debugging / display).
 */
export async function listQACategories(): Promise<Array<{ category: string; count: number }>> {
  if (!config.obsidianEnabled) return [];
  try {
    const baseDir = qaDir();
    if (!fs.existsSync(baseDir)) return [];
    const categories = fs
      .readdirSync(baseDir)
      .filter((f) => fs.statSync(path.join(baseDir, f)).isDirectory());
    return categories.map((cat) => ({
      category: cat,
      count: fs.readdirSync(path.join(baseDir, cat)).filter((f) => f.endsWith(".md")).length,
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// User notes (facts about each user) — kept for backward compat
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
        results.push(`[${file}]\n${content.slice(0, 500)}`);
      }
    }
    return results.slice(0, 5);
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
    // Non-critical
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
    // Non-critical
  }
}
