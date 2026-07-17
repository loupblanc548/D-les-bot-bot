/**
 * syncTypeScriptSkills.ts — Knowledge Ingestion: TypeScript Wizard Knowledge Base
 *
 * Fetches Matt Pocock's TypeScript skills from GitHub monthly,
 * parses the directory structure to extract problem/solution patterns,
 * and upserts them into the TypeScriptSkill table.
 *
 * Runs monthly (1st of month at 04:00).
 */

import { schedule, ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const GITHUB_API_BASE = "https://api.github.com/repos/mattpocock/skills/contents/skills";
const RAW_BASE = "https://raw.githubusercontent.com/mattpocock/skills/main/skills";
const FETCH_TIMEOUT_MS = 15_000;

let cronJob: ScheduledTask | null = null;

interface GitHubContent {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

interface ParsedSkill {
  slug: string;
  title: string;
  category: string;
  problemStatement: string;
  solutionCode: string;
  explanation: string;
  rawUrl: string;
}

/**
 * Fetch JSON from GitHub API with timeout.
 */
async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Discord-Surveillance-Bot/1.0",
        Accept: "application/vnd.github.v3+json",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch raw text from GitHub.
 */
async function fetchRaw(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Discord-Surveillance-Bot/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Recursively traverse the skills directory and parse each skill.
 */
async function crawlSkillsDirectory(): Promise<ParsedSkill[]> {
  const skills: ParsedSkill[] = [];

  let entries: GitHubContent[];
  try {
    entries = await fetchJson(GITHUB_API_BASE);
  } catch (err) {
    logger.warn(
      `[TS-WIZARD] Cannot fetch skills directory: ${err instanceof Error ? err.message : String(err)}`,
    );
    return skills;
  }

  if (!Array.isArray(entries)) return skills;

  for (const entry of entries) {
    if (entry.type === "dir") {
      // Each subdirectory is a skill — fetch its contents
      try {
        const subEntries: GitHubContent[] = await fetchJson(
          `${GITHUB_API_BASE}/${entry.name}`,
        );
        if (!Array.isArray(subEntries)) continue;

        let problemStatement = "";
        let solutionCode = "";
        let explanation = "";
        let rawUrl = "";

        for (const file of subEntries) {
          if (file.type !== "file") continue;
          const filePath = `${entry.name}/${file.name}`;
          const rawFileUrl = `${RAW_BASE}/${filePath}`;

          // Categorize files by name pattern
          if (file.name.match(/problem|readme|description/i)) {
            try {
              problemStatement = await fetchRaw(rawFileUrl);
              rawUrl = rawFileUrl;
            } catch { /* skip */ }
          } else if (file.name.match(/solution|answer|code/i)) {
            try {
              solutionCode = await fetchRaw(rawFileUrl);
              if (!rawUrl) rawUrl = rawFileUrl;
            } catch { /* skip */ }
          } else if (file.name.match(/explanation|notes|guide/i)) {
            try {
              explanation = await fetchRaw(rawFileUrl);
              if (!rawUrl) rawUrl = rawFileUrl;
            } catch { /* skip */ }
          } else if (file.name.endsWith(".md")) {
            // Generic markdown — use as explanation if not yet set
            try {
              const content = await fetchRaw(rawFileUrl);
              if (!explanation) explanation = content;
              if (!problemStatement) problemStatement = content.split("\n").slice(0, 5).join("\n");
              rawUrl = rawFileUrl;
            } catch { /* skip */ }
          } else if (file.name.endsWith(".ts") || file.name.endsWith(".tsx")) {
            // TypeScript file — use as solution code
            try {
              solutionCode = await fetchRaw(rawFileUrl);
              if (!rawUrl) rawUrl = rawFileUrl;
            } catch { /* skip */ }
          }
        }

        // Only add if we got meaningful content
        if (problemStatement || solutionCode || explanation) {
          // Derive title from directory name
          const title = entry.name
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());

          // Derive category from first word or common patterns
          const category = entry.name.split(/[-_]/)[0] || "general";

          skills.push({
            slug: entry.name,
            title,
            category,
            problemStatement: problemStatement.slice(0, 5000),
            solutionCode: solutionCode.slice(0, 10000),
            explanation: explanation.slice(0, 5000),
            rawUrl,
          });
        }
      } catch (err) {
        logger.debug(
          `[TS-WIZARD] Failed to crawl ${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return skills;
}

/**
 * Sync TypeScript skills into the database.
 */
export async function syncTypeScriptSkills(): Promise<void> {
  const CYAN = "\x1b[36m";
  const GREEN = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const RED = "\x1b[31m";
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";

  logger.info(
    `${CYAN}${BOLD}[KNOWLEDGE-INGESTION]${RESET} ${YELLOW}[TS-WIZARD]${RESET} Starting sync...`,
  );

  try {
    const skills = await crawlSkillsDirectory();

    if (skills.length === 0) {
      logger.warn(
        `${CYAN}[KNOWLEDGE-INGESTION]${RESET} ${RED}[TS-WIZARD] No skills parsed — repo structure may have changed${RESET}`,
      );
      return;
    }

    // Upsert each skill by slug (slug is @unique)
    const batchSize = 20;
    for (let i = 0; i < skills.length; i += batchSize) {
      const batch = skills.slice(i, i + batchSize);
      await Promise.all(
        batch.map((s) =>
          prisma.typeScriptSkill.upsert({
            where: { slug: s.slug },
            create: {
              slug: s.slug,
              title: s.title,
              category: s.category,
              problemStatement: s.problemStatement,
              solutionCode: s.solutionCode,
              explanation: s.explanation,
              rawUrl: s.rawUrl,
            },
            update: {
              title: s.title,
              category: s.category,
              problemStatement: s.problemStatement,
              solutionCode: s.solutionCode,
              explanation: s.explanation,
              rawUrl: s.rawUrl,
            },
          }).catch((err: unknown) => {
            logger.debug(`[TS-WIZARD] Upsert failed for ${s.slug}: ${err instanceof Error ? err.message : String(err)}`);
          }),
        ),
      );
    }

    logger.info(
      `${CYAN}${BOLD}[KNOWLEDGE-INGESTION]${RESET} ${GREEN}[TS-WIZARD] Synced ${skills.length} type-patterns${RESET}`,
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      `${CYAN}[KNOWLEDGE-INGESTION]${RESET} ${RED}[TS-WIZARD] Sync failed: ${errMsg}${RESET}`,
    );
    if (err instanceof Error && err.stack) {
      logger.debug(`[TS-WIZARD] Stack: ${err.stack}`);
    }
    logger.info(
      `${CYAN}[KNOWLEDGE-INGESTION]${RESET} ${YELLOW}[TS-WIZARD] Falling back to existing Neon DB cache${RESET}`,
    );
  }
}

/**
 * Start the monthly cron (1st of month at 04:00).
 */
export function startSyncTypeScriptSkills(): void {
  if (cronJob) {
    logger.warn("[TS-WIZARD] Cron already running — ignored");
    return;
  }

  cronJob = schedule("0 4 1 * *", () => {
    void syncTypeScriptSkills().catch((err) =>
      logger.error(`[TS-WIZARD] Cron error: ${err instanceof Error ? err.message : String(err)}`),
    );
  });

  // Initial sync after 60s on startup
  setTimeout(() => {
    void syncTypeScriptSkills().catch(() => {});
  }, 60_000);

  if (cronJob.unref) cronJob.unref();
  logger.info(`${"\x1b[36m"}[KNOWLEDGE-INGESTION] [TS-WIZARD] Cron started — monthly sync (1st at 04:00)${"\x1b[0m"}`);
}

export function stopSyncTypeScriptSkills(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[TS-WIZARD] Cron stopped");
  }
}
