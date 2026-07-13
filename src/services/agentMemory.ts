/**
 * agentMemory.ts — MODULE B: Mémoire vectorielle persistante
 *
 * Vector store local pour que l'agent se souvienne des conversations passées.
 * Utilise des embeddings simples (hash-based) pour la similarité sémantique
 * sans dépendance externe — léger et adapté au budget mémoire.
 *
 * Au lieu d'appeler une API d'embeddings, on utilise une approche TF-IDF
 * locale (bag-of-words + cosine similarity) qui fonctionne bien pour
 * des conversations Discord courtes.
 */

import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  userId: string;
  guildId: string;
  content: string;
  role: "user" | "assistant";
  timestamp: number;
  vector: Map<string, number>;
  importance: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  similarity: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_MEMORIES_PER_USER = 50;
const MAX_SEARCH_RESULTS = 5;
const MIN_SIMILARITY_THRESHOLD = 0.15;
const IMPORTANCE_DECAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── In-memory vector store ──────────────────────────────────────────────────

const memoryStore = new Map<string, MemoryEntry>();
let isInitialized = false;

// ─── Text vectorization (TF-IDF lightweight) ─────────────────────────────────

const STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "de",
  "du",
  "et",
  "ou",
  "mais",
  "donc",
  "or",
  "ni",
  "car",
  "que",
  "qui",
  "quoi",
  "dont",
  "où",
  "je",
  "tu",
  "il",
  "elle",
  "on",
  "nous",
  "vous",
  "ils",
  "elles",
  "mon",
  "ton",
  "son",
  "ma",
  "ta",
  "sa",
  "mes",
  "tes",
  "ses",
  "ce",
  "cette",
  "ces",
  "cet",
  "ça",
  "ca",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "by",
  "and",
  "or",
  "but",
  "not",
  "no",
  "yes",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function vectorize(text: string): Map<string, number> {
  const tokens = tokenize(text);
  const freq = new Map<string, number>();

  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  // Normalize by total tokens (TF)
  const total = tokens.length || 1;
  for (const [key, value] of freq) {
    freq.set(key, value / total);
  }

  return freq;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const [key, valA] of a) {
    magA += valA * valA;
    const valB = b.get(key);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }

  for (const valB of b.values()) {
    magB += valB * valB;
  }

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Store a conversation message in the vector memory.
 */
export function storeMemory(
  userId: string,
  guildId: string,
  content: string,
  role: "user" | "assistant",
): MemoryEntry {
  const id = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entry: MemoryEntry = {
    id,
    userId,
    guildId,
    content: content.slice(0, 500), // Cap content size
    role,
    timestamp: Date.now(),
    vector: vectorize(content),
    importance: 1.0,
  };

  // Enforce per-user limit (evict oldest)
  const userEntries = [...memoryStore.values()]
    .filter((e) => e.userId === userId)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (userEntries.length >= MAX_MEMORIES_PER_USER) {
    const toEvict = userEntries.slice(0, userEntries.length - MAX_MEMORIES_PER_USER + 1);
    for (const e of toEvict) {
      memoryStore.delete(e.id);
    }
  }

  memoryStore.set(id, entry);
  return entry;
}

/**
 * Search for relevant memories using semantic similarity.
 */
export function searchMemories(
  userId: string,
  query: string,
  guildId?: string,
): MemorySearchResult[] {
  const queryVector = vectorize(query);

  const results: MemorySearchResult[] = [];

  for (const entry of memoryStore.values()) {
    // Filter by user (and optionally guild)
    if (entry.userId !== userId) continue;
    if (guildId && entry.guildId !== guildId) continue;

    const similarity = cosineSimilarity(queryVector, entry.vector);

    // Apply time decay to importance
    const ageMs = Date.now() - entry.timestamp;
    const decayFactor = Math.max(0.1, 1 - ageMs / IMPORTANCE_DECAY_MS);
    const adjustedScore = similarity * decayFactor;

    if (adjustedScore >= MIN_SIMILARITY_THRESHOLD) {
      results.push({ entry, similarity: adjustedScore });
    }
  }

  // Sort by similarity (highest first) and return top N
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, MAX_SEARCH_RESULTS);
}

/**
 * Format memories for injection into the system prompt.
 */
export function formatMemoriesForPrompt(userId: string, query: string, guildId?: string): string {
  const results = searchMemories(userId, query, guildId);

  if (results.length === 0) return "";

  const memoryLines = results.map((r) => {
    const time = new Date(r.entry.timestamp).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `[${time}] ${r.entry.role === "user" ? "User" : "Toi"}: ${r.entry.content.slice(0, 150)} (sim: ${r.similarity.toFixed(2)})`;
  });

  return (
    "\n## SOUVENIRS PERTINENTS (mémoire conversationnelle)\n" +
    "Voici des conversations passées avec cet utilisateur, triées par pertinence:\n" +
    memoryLines.join("\n") +
    "\n"
  );
}

/**
 * Persist important memories to the database (for cross-restart persistence).
 */
export async function persistMemoryToDb(userId: string, _guildId: string): Promise<void> {
  const userEntries = [...memoryStore.values()]
    .filter((e) => e.userId === userId && e.importance > 0.5)
    .slice(-10); // Only persist the 10 most recent important ones

  for (const entry of userEntries) {
    try {
      await prisma.memoryFact.upsert({
        where: {
          userId_key: {
            userId,
            key: `conv_${entry.id}`,
          },
        },
        create: {
          userId,
          key: `conv_${entry.id}`,
          value: entry.content.slice(0, 200),
          category: "conversation",
          weight: entry.importance,
        },
        update: {
          value: entry.content.slice(0, 200),
          weight: entry.importance,
        },
      });
    } catch {
      // Non-critical — skip on error
    }
  }
}

/**
 * Load memories from the database on startup.
 */
export async function loadMemoriesFromDb(): Promise<void> {
  if (isInitialized) return;

  try {
    const facts = await prisma.memoryFact.findMany({
      where: { category: "conversation" },
      orderBy: { weight: "desc" },
      take: 200,
    });

    for (const fact of facts) {
      const entry: MemoryEntry = {
        id: fact.key.replace("conv_", ""),
        userId: fact.userId,
        guildId: "",
        content: fact.value,
        role: "assistant",
        timestamp: fact.createdAt?.getTime() ?? Date.now(),
        vector: vectorize(fact.value),
        importance: fact.weight,
      };
      memoryStore.set(entry.id, entry);
    }

    isInitialized = true;
    logger.info(`[AgentMemory] Loaded ${facts.length} memories from database`);
  } catch (err) {
    logger.warn(
      `[AgentMemory] Failed to load from DB: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Get memory store stats.
 */
export function getMemoryStats(): { totalEntries: number; uniqueUsers: number } {
  const users = new Set<string>();
  for (const entry of memoryStore.values()) {
    users.add(entry.userId);
  }
  return { totalEntries: memoryStore.size, uniqueUsers: users.size };
}

/**
 * Clear all memories (for shutdown/reset).
 */
export function clearAllMemories(): void {
  memoryStore.clear();
  isInitialized = false;
  logger.info("[AgentMemory] All memories cleared");
}
