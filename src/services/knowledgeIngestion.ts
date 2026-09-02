/**
 * knowledgeIngestion.ts — GitHub repo syncers for the knowledge pipeline
 */
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { fetchTextRetry, fetchJsonRetry } from "../utils/fetchRetry.js";
import type { Prisma } from "@prisma/client";

const TIMEOUT = 30_000;
const BATCH = 50;

// ─── 1. Public APIs ──────────────────────────────────────────────
interface PublicApiEntry {
  API: string;
  Description: string;
  Auth: string;
  HTTPS: boolean;
  Cors: string;
  Link: string;
  Category: string;
}

export async function syncPublicApis(): Promise<number> {
  logger.info("[KnowledgeIngestion] [PUBLIC_APIS] Starting sync...");
  const data = await fetchJsonRetry<{ entries: PublicApiEntry[] }>(
    "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md",
    { timeoutMs: TIMEOUT },
  );
  // Fallback: parse JSON from api-list directory
  let entries: PublicApiEntry[];
  if (data?.entries) {
    entries = data.entries;
  } else {
    const json = await fetchJsonRetry<{ entries: PublicApiEntry[] }>(
      "https://api.github.com/repos/public-apis/public-apis/contents/README.md",
      { timeoutMs: TIMEOUT },
    );
    if (!json) {
      logger.warn("[PUBLIC_APIS] Could not fetch");
      return 0;
    }
    entries = (json as any as { entries: PublicApiEntry[] }).entries ?? [];
  }
  if (!entries.length) {
    // Try direct JSON source
    const directJson = await fetchJsonRetry<{ entries: PublicApiEntry[] }>(
      "https://raw.githubusercontent.com/public-apis/public-apis/refs/heads/master/README.md",
      { timeoutMs: TIMEOUT },
    );
    entries = directJson?.entries ?? [];
  }
  let count = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await prisma.freeResource
      .createMany({
        data: batch.map((e) => ({
          category: "PUBLIC_API",
          name: e.API,
          url: e.Link,
          description: e.Description,
          tags: e.Category,
          sourceRepo: "public-apis/public-apis",
          metadata: { auth: e.Auth, https: e.HTTPS, cors: e.Cors } as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      })
      .catch(() => {});
    count += batch.length;
  }
  logger.info(`[PUBLIC_APIS] Synced ${count} entries`);
  return count;
}

// ─── 2. Code Snippets (30-seconds-of-code) ──────────────────────
export async function syncCodeSnippets(): Promise<number> {
  logger.info("[KnowledgeIngestion] [CODE_SNIPPETS] Starting sync...");
  const md = await fetchTextRetry(
    "https://raw.githubusercontent.com/30-seconds/30-seconds-of-code/master/README.md",
    { timeoutMs: TIMEOUT },
  );
  if (!md) {
    logger.warn("[CODE_SNIPPETS] Fetch failed");
    return 0;
  }
  // Parse: ### Title sections with code blocks
  const snippets: Array<{ name: string; description: string; tags: string; code: string }> = [];
  const sections = md.split(/^###\s+/m);
  for (const section of sections) {
    const titleMatch = section.match(/^(.+)$/m);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    if (title.length < 3 || title.includes("Table of Contents")) continue;
    const descMatch = section.match(/-\s+(.+)$/m);
    const desc = descMatch?.[1]?.trim() ?? "";
    const codeMatch = section.match(/```(?:javascript|js|typescript|ts|python|py)?\n([\s\S]*?)```/);
    const code = codeMatch?.[1]?.trim() ?? "";
    if (code.length > 20) {
      snippets.push({
        name: title,
        description: desc,
        tags: "javascript,typescript,snippet",
        code,
      });
    }
  }
  let count = 0;
  for (let i = 0; i < snippets.length; i += BATCH) {
    const batch = snippets.slice(i, i + BATCH);
    await prisma.freeResource
      .createMany({
        data: batch.map((s) => ({
          category: "CODE_SNIPPET",
          name: s.name,
          url: "https://github.com/30-seconds/30-seconds-of-code",
          description: `${s.description}\n\n\`\`\`js\n${s.code.slice(0, 500)}\n\`\`\``,
          language: "javascript",
          tags: s.tags,
          sourceRepo: "30-seconds/30-seconds-of-code",
        })),
        skipDuplicates: true,
      })
      .catch(() => {});
    count += batch.length;
  }
  logger.info(`[CODE_SNIPPETS] Synced ${count} snippets`);
  return count;
}

// ─── 3. Free Programming Books ───────────────────────────────────
export async function syncFreeBooks(): Promise<number> {
  logger.info("[KnowledgeIngestion] [FREE_BOOKS] Starting sync...");
  const languages = [
    "books/free-programming-books.md",
    "books/free-programming-books-fr.md",
    "books/free-programming-books-es.md",
  ];
  let count = 0;
  for (const langFile of languages) {
    const md = await fetchTextRetry(
      `https://raw.githubusercontent.com/EbookFoundation/free-programming-books/main/${langFile}`,
      { timeoutMs: TIMEOUT },
    );
    if (!md) continue;
    // Parse: [Title](URL) by Author (License) - tags
    const bookRegex =
      /\*\s*\[([^\]]+)\]\(([^)]+)\)(?:\s*(?:by|[-–—]\s*)(.+?))?(?:\s*\(([^)]+)\))?/g;
    let _match: RegExpExecArray | null;
    const books: Array<{ name: string; url: string; description: string; tags: string }> = [];
    let currentSection = "general";
    const sectionRegex = /^#{2,3}\s+(.+)$/gm;
    const lines = md.split("\n");
    for (const line of lines) {
      const secMatch = line.match(sectionRegex);
      if (secMatch) {
        currentSection = secMatch[1].trim();
        continue;
      }
      const bm = line.match(bookRegex);
      if (bm) {
        const m = line.match(
          /\*\s*\[([^\]]+)\]\(([^)]+)\)(?:\s*(?:by|[-–—]\s*)(.+?))?(?:\s*\(([^)]+)\))?/,
        );
        if (m) {
          books.push({
            name: m[1].trim(),
            url: m[2].trim(),
            description: m[3]?.trim() ?? "Free programming book",
            tags: currentSection,
          });
        }
      }
    }
    for (let i = 0; i < books.length; i += BATCH) {
      const batch = books.slice(i, i + BATCH);
      await prisma.freeResource
        .createMany({
          data: batch.map((b) => ({
            category: "FREE_BOOK",
            name: b.name,
            url: b.url,
            description: b.description,
            tags: b.tags,
            sourceRepo: "EbookFoundation/free-programming-books",
          })),
          skipDuplicates: true,
        })
        .catch(() => {});
      count += batch.length;
    }
  }
  logger.info(`[FREE_BOOKS] Synced ${count} books`);
  return count;
}

// ─── 4. System Design Primer ─────────────────────────────────────
export async function syncSystemDesign(): Promise<number> {
  logger.info("[KnowledgeIngestion] [SYSTEM_DESIGN] Starting sync...");
  const files = [
    "README.md",
    "solutions/system_design/README.md",
    "solutions/system_design/chaching.md",
    "solutions/system_design/load_balancer.md",
    "solutions/system_design/sharding.md",
  ];
  let count = 0;
  for (const file of files) {
    const md = await fetchTextRetry(
      `https://raw.githubusercontent.com/donnemartin/system-design-primer/master/${file}`,
      { timeoutMs: TIMEOUT },
    );
    if (!md || md.length < 100) continue;
    const title = file.split("/").pop()?.replace(".md", "") ?? "system-design";
    const summary = md.slice(0, 500).replace(/[#*`]/g, "").trim();
    await prisma.agentKnowledge
      .upsert({
        where: { url: `https://github.com/donnemartin/system-design-primer/blob/master/${file}` },
        create: {
          url: `https://github.com/donnemartin/system-design-primer/blob/master/${file}`,
          title: `System Design: ${title}`,
          content: md.slice(0, 10000),
          summary,
          wordCount: md.split(/\s+/).length,
          source: "system_design_primer",
          category: "SYSTEM_DESIGN",
          tags: title,
        } as never,
        update: {
          title: `System Design: ${title}`,
          content: md.slice(0, 10000),
          summary,
          wordCount: md.split(/\s+/).length,
          category: "SYSTEM_DESIGN",
          tags: title,
        } as never,
      })
      .catch(() => {});
    count++;
  }
  logger.info(`[SYSTEM_DESIGN] Synced ${count} documents`);
  return count;
}

// ─── 5. Awesome Lists (whitelisted only) ─────────────────────────
const AWESOME_WHITELIST = [
  "security",
  "nodejs",
  "typescript",
  "docker",
  "devops",
  "cybersecurity",
  "python",
  "golang",
  "rust",
  "linux",
  "databases",
  "front-end",
  "javascript",
  "machine learning",
  "artificial intelligence",
  "self-hosted",
  "kubernetes",
];

export async function syncAwesomeLists(): Promise<number> {
  logger.info("[KnowledgeIngestion] [AWESOME_LISTS] Starting sync...");
  const md = await fetchTextRetry(
    "https://raw.githubusercontent.com/sindresorhus/awesome/main/README.md",
    { timeoutMs: TIMEOUT },
  );
  if (!md) {
    logger.warn("[AWESOME_LISTS] Fetch failed");
    return 0;
  }
  // Parse: - [Name](URL) - Description, under ## Category headers
  const lines = md.split("\n");
  let currentCat = "";
  let inWhitelisted = false;
  const items: Array<{ name: string; url: string; description: string; tags: string }> = [];
  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      currentCat = headerMatch[1].trim().toLowerCase();
      inWhitelisted = AWESOME_WHITELIST.some((w) => currentCat.includes(w));
      continue;
    }
    if (!inWhitelisted) continue;
    const itemMatch = line.match(/^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)\s*[-–—:]\s*(.+)/);
    if (itemMatch) {
      items.push({
        name: itemMatch[1].trim(),
        url: itemMatch[2].trim(),
        description: itemMatch[3].trim().slice(0, 500),
        tags: currentCat,
      });
    }
  }
  let count = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    await prisma.freeResource
      .createMany({
        data: batch.map((it) => ({
          category: "AWESOME_LIST",
          name: it.name,
          url: it.url,
          description: it.description,
          tags: it.tags,
          sourceRepo: "sindresorhus/awesome",
        })),
        skipDuplicates: true,
      })
      .catch(() => {});
    count += batch.length;
  }
  logger.info(
    `[AWESOME_LISTS] Synced ${count} items (whitelisted: ${AWESOME_WHITELIST.join(", ")})`,
  );
  return count;
}

const EXTRA_KNOWLEDGE_REPOS = [
  {
    owner: "awesome-selfhosted",
    repo: "awesome-selfhosted",
    description: "Liste de logiciels self-hosted open source.",
  },
  {
    owner: "vinta",
    repo: "awesome-python",
    description: "Curated list of Python frameworks, libraries, and resources.",
  },
  {
    owner: "avelino",
    repo: "awesome-go",
    description: "Curated list of Go frameworks, libraries, and software.",
  },
  {
    owner: "rust-unofficial",
    repo: "awesome-rust",
    description: "Curated list of Rust code and resources.",
  },
  {
    owner: "trimstray",
    repo: "the-book-of-secret-knowledge",
    description: "Collection of inspiring lists, manuals, cheatsheets, and tools.",
  },
  {
    owner: "ripienaar",
    repo: "free-for-dev",
    description: "SaaS, PaaS and IaaS offerings with free tiers for developers.",
  },
];

/** Index extra GitHub knowledge repos so searchKnowledge / getGitHubRepo can find them. */
export async function syncExtraGithubRepos(): Promise<number> {
  logger.info("[KnowledgeIngestion] [EXTRA_REPOS] Starting sync...");
  await prisma.freeResource
    .createMany({
      data: EXTRA_KNOWLEDGE_REPOS.map((r) => ({
        category: "GITHUB_REPO",
        name: `${r.owner}/${r.repo}`,
        url: `https://github.com/${r.owner}/${r.repo}`,
        description: r.description,
        tags: "github,repo,awesome",
        sourceRepo: `${r.owner}/${r.repo}`,
      })),
      skipDuplicates: true,
    })
    .catch(() => {});
  logger.info(`[EXTRA_REPOS] Indexed ${EXTRA_KNOWLEDGE_REPOS.length} GitHub repos`);
  return EXTRA_KNOWLEDGE_REPOS.length;
}
