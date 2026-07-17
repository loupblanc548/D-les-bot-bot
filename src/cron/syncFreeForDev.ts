/**
 * syncFreeForDev.ts — Knowledge Ingestion: Free-for-Dev Resource Finder
 *
 * Fetches the free-for-dev README from GitHub weekly,
 * parses markdown headers as categories and links as resources,
 * and upserts them into the FreeResource table.
 *
 * Runs weekly (Sunday 03:00).
 */

import { schedule, ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const FREE_FOR_DEV_URL =
  "https://raw.githubusercontent.com/ripienaar/free-for-dev/master/README.md";
const FETCH_TIMEOUT_MS = 30_000;

let cronJob: ScheduledTask | null = null;

interface ParsedResource {
  category: string;
  name: string;
  url: string;
  description: string;
}

/**
 * Parse the free-for-dev markdown into structured resources.
 * Format: `### Category` headers, `[Name](URL) - Description` links.
 */
function parseFreeForDevMarkdown(markdown: string): ParsedResource[] {
  const resources: ParsedResource[] = [];
  const lines = markdown.split("\n");
  let currentCategory = "Uncategorized";

  // Regex: [Name](URL) - Description  OR  [Name](URL) — Description
  const linkRegex = /^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)\s*[-–—]\s*(.+)$/;
  // Also match: [Name](URL) : Description
  const linkRegex2 = /^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)\s*[:：]\s*(.+)$/;
  // Header: ### Category or ## Category
  const headerRegex = /^#{2,3}\s+(.+)$/;

  for (const line of lines) {
    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      const header = headerMatch[1].trim();
      // Skip Table of Contents and similar
      if (
        !header.toLowerCase().includes("table of contents") &&
        !header.toLowerCase().includes("toc") &&
        !header.match(/^[\d]+\.?\s/) // Skip numbered TOC entries
      ) {
        currentCategory = header;
      }
      continue;
    }

    let match = line.match(linkRegex);
    if (!match) match = line.match(linkRegex2);
    if (match) {
      const [, name, url, description] = match;
      // Filter out non-resource links (anchors, images, etc.)
      if (
        url.startsWith("http") &&
        !url.includes("github.com/ripienaar") &&
        name.length > 1
      ) {
        resources.push({
          category: currentCategory,
          name: name.trim(),
          url: url.trim(),
          description: description.trim().slice(0, 1000),
        });
      }
    }
  }

  return resources;
}

/**
 * Fetch and sync the free-for-dev resources.
 */
export async function syncFreeForDev(): Promise<void> {
  const CYAN = "\x1b[36m";
  const GREEN = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const RED = "\x1b[31m";
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";

  logger.info(
    `${CYAN}${BOLD}[KNOWLEDGE-INGESTION]${RESET} ${YELLOW}[FREE-FOR-DEV]${RESET} Starting sync...`,
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(FREE_FOR_DEV_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "Discord-Surveillance-Bot/1.0" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const markdown = await response.text();
    const resources = parseFreeForDevMarkdown(markdown);

    if (resources.length === 0) {
      logger.warn(
        `${CYAN}[KNOWLEDGE-INGESTION]${RESET} ${RED}[FREE-FOR-DEV] No resources parsed — markdown format may have changed${RESET}`,
      );
      return;
    }

    // Batch insert — delete stale + create new (weekly full sync)
    const syncedUrls = resources.map((r) => r.url);

    // Delete entries not in current sync
    await prisma.$executeRaw`DELETE FROM "FreeResource" WHERE url NOT IN (${syncedUrls})`.catch(() => {});

    // Insert in batches using createMany with skipDuplicates
    const batchSize = 50;
    for (let i = 0; i < resources.length; i += batchSize) {
      const batch = resources.slice(i, i + batchSize);
      await prisma.freeResource.createMany({
        data: batch.map((r) => ({
          category: r.category,
          name: r.name,
          url: r.url,
          description: r.description,
        })),
        skipDuplicates: true,
      }).catch(() => {});
    }

    logger.info(
      `${CYAN}${BOLD}[KNOWLEDGE-INGESTION]${RESET} ${GREEN}[FREE-FOR-DEV] Indexed ${resources.length} items across ${new Set(resources.map((r) => r.category)).size} categories${RESET}`,
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      `${CYAN}[KNOWLEDGE-INGESTION]${RESET} ${RED}[FREE-FOR-DEV] Sync failed: ${errMsg}${RESET}`,
    );
    if (err instanceof Error && err.stack) {
      logger.debug(`[FREE-FOR-DEV] Stack: ${err.stack}`);
    }
    logger.info(
      `${CYAN}[KNOWLEDGE-INGESTION]${RESET} ${YELLOW}[FREE-FOR-DEV] Falling back to existing Neon DB cache${RESET}`,
    );
  }
}

/**
 * Start the weekly cron (Sunday 03:00).
 */
export function startSyncFreeForDev(): void {
  if (cronJob) {
    logger.warn("[FREE-FOR-DEV] Cron already running — ignored");
    return;
  }

  cronJob = schedule("0 3 * * 0", () => {
    void syncFreeForDev().catch((err) =>
      logger.error(`[FREE-FOR-DEV] Cron error: ${err instanceof Error ? err.message : String(err)}`),
    );
  });

  // Initial sync after 30s on startup
  setTimeout(() => {
    void syncFreeForDev().catch(() => {});
  }, 30_000);

  if (cronJob.unref) cronJob.unref();
  logger.info(`${"\x1b[36m"}[KNOWLEDGE-INGESTION] [FREE-FOR-DEV] Cron started — weekly sync (Sun 03:00)${"\x1b[0m"}`);
}

export function stopSyncFreeForDev(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[FREE-FOR-DEV] Cron stopped");
  }
}
