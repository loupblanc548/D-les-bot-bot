/**
 * cognitiveLoopEngine.ts — Vectorial Cognitive Anti-Looping Engine
 *
 * Detects cognitive stasis in the agent loop by comparing embedding vectors
 * of the agent's "Thought" strings across iterations. If cosine similarity
 * between any two thoughts exceeds 0.95, a "Cognitive Loop Stasis" anomaly
 * is flagged — short-circuiting the loop before hitting the max iteration ceiling.
 *
 * Uses a lightweight hash-based embedding fallback if the API is unavailable,
 * ensuring the engine never crashes the agent loop.
 */

import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThoughtEmbedding {
  iteration: number;
  thought: string;
  embedding: number[];
  timestamp: number;
}

export interface LoopStasisResult {
  stasisDetected: boolean;
  similarityMatrix: number[][];
  maxSimilarity: number;
  matchedIterations: [number, number] | null;
  thought: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.95;
const EMBEDDING_TIMEOUT_MS = 3_000;
const EMBEDDING_MODEL = "text-embedding-nomic-embed-text-v1.5";
const FALLBACK_HASH_DIMENSIONS = 128;

// ─── Per-session embedding cache ─────────────────────────────────────────────

const sessionCaches = new Map<string, ThoughtEmbedding[]>();

/**
 * Initialize a new session cache for an agent loop run.
 */
export function initSession(sessionId: string): void {
  sessionCaches.set(sessionId, []);
}

/**
 * Purge the embedding cache for a session. Must be called on loop termination
 * (both success and failure) to prevent memory leaks.
 */
export function purgeSession(sessionId: string): void {
  sessionCaches.delete(sessionId);
}

// ─── Embedding generation ────────────────────────────────────────────────────

/**
 * Generate an embedding vector for a thought string.
 * Uses the OpenAI-compatible embeddings API via OpenRouter.
 * Falls back to a deterministic hash-based pseudo-embedding if the API fails.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create(
      {
        model: EMBEDDING_MODEL,
        input: text.slice(0, 2000),
      },
      { timeout: EMBEDDING_TIMEOUT_MS },
    );
    const vector = response.data?.[0]?.embedding;
    if (vector && vector.length > 0) {
      return vector;
    }
    throw new Error("Empty embedding response");
  } catch (err) {
    logger.debug(
      `[CognitiveEngine] Embedding API unavailable — using hash fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return hashEmbedding(text);
  }
}

/**
 * Deterministic hash-based pseudo-embedding fallback.
 * Generates a fixed-dimension vector from the text using character frequency analysis.
 * Not semantically meaningful but catches exact/near-exact repetition.
 */
function hashEmbedding(text: string): number[] {
  const vec = new Array(FALLBACK_HASH_DIMENSIONS).fill(0);
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    vec[i % FALLBACK_HASH_DIMENSIONS] += charCode;
    vec[(charCode * 31) % FALLBACK_HASH_DIMENSIONS] += 1;
  }
  // Normalize to unit length
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

// ─── Cosine similarity ───────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * similarity = (A · B) / (||A|| * ||B||)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // Pad shorter vector with zeros
    const maxLen = Math.max(a.length, b.length);
    while (a.length < maxLen) a.push(0);
    while (b.length < maxLen) b.push(0);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

// ─── Core: Cognitive loop detection ──────────────────────────────────────────

/**
 * Record a thought for the current iteration and check for cognitive stasis.
 *
 * @param sessionId The agent loop session ID (interactionId)
 * @param iteration The current iteration number (0-indexed)
 * @param thought The raw thought/content string from the LLM
 * @returns LoopStasisResult indicating whether a loop was detected
 */
export async function checkCognitiveStasis(
  sessionId: string,
  iteration: number,
  thought: string,
): Promise<LoopStasisResult> {
  const cache = sessionCaches.get(sessionId);
  if (!cache) {
    return {
      stasisDetected: false,
      similarityMatrix: [],
      maxSimilarity: 0,
      matchedIterations: null,
      thought,
    };
  }

  // Generate embedding for current thought
  const currentEmbedding = await generateEmbedding(thought);

  // Build similarity matrix against all previous thoughts
  const similarities: number[] = [];
  let maxSim = 0;
  let matchedIter: [number, number] | null = null;

  for (const prev of cache) {
    const sim = cosineSimilarity(currentEmbedding, prev.embedding);
    similarities.push(sim);
    if (sim > maxSim) {
      maxSim = sim;
      matchedIter = [prev.iteration, iteration];
    }
  }

  // Build full matrix for logging (previous x current)
  const matrix: number[][] = [];
  for (const prev of cache) {
    const row: number[] = [];
    for (const curr of cache) {
      row.push(cosineSimilarity(prev.embedding, curr.embedding));
    }
    matrix.push(row);
  }

  // Record current thought in cache
  cache.push({
    iteration,
    thought: thought.slice(0, 500),
    embedding: currentEmbedding,
    timestamp: Date.now(),
  });

  const stasisDetected = maxSim >= SIMILARITY_THRESHOLD;

  if (stasisDetected && matchedIter) {
    // ANSI cyberpunk telemetry logging
    const CYAN = "\x1b[36m";
    const RED = "\x1b[31m";
    const YELLOW = "\x1b[33m";
    const RESET = "\x1b[0m";
    const BOLD = "\x1b[1m";

    logger.warn(
      `${CYAN}${BOLD}[CognitiveEngine]${RESET} ${RED}${BOLD}🚨 COGNITIVE LOOP STASIS DETECTED${RESET}\n` +
        `  ${YELLOW}Similarity:${RESET} ${maxSim.toFixed(4)} (threshold: ${SIMILARITY_THRESHOLD})\n` +
        `  ${YELLOW}Matched iterations:${RESET} #${matchedIter[0] + 1} ↔ #${matchedIter[1] + 1}\n` +
        `  ${YELLOW}Thought preview:${RESET} "${thought.slice(0, 120)}..."\n` +
        `  ${YELLOW}Action:${RESET} Short-circuiting → agentReflector (STRATEGY_STEREOTYPY_DETECTED)`,
    );
  } else if (cache.length > 1) {
    const CYAN = "\x1b[36m";
    const GREEN = "\x1b[32m";
    const RESET = "\x1b[0m";
    const DIM = "\x1b[2m";

    logger.info(
      `${CYAN}[CognitiveEngine]${RESET} ${GREEN}✓${RESET} Iteration ${iteration + 1} — max similarity: ${DIM}${maxSim.toFixed(4)}${RESET} ${maxSim < 0.8 ? "🟢" : maxSim < 0.95 ? "🟡" : "🔴"}`,
    );
  }

  return {
    stasisDetected,
    similarityMatrix: matrix,
    maxSimilarity: maxSim,
    matchedIterations: matchedIter,
    thought,
  };
}

/**
 * Get the number of recorded thoughts in a session.
 */
export function getSessionThoughtCount(sessionId: string): number {
  return sessionCaches.get(sessionId)?.length ?? 0;
}

/**
 * Get stats for monitoring/dashboard.
 */
export function getEngineStats(): { activeSessions: number; totalThoughts: number } {
  let totalThoughts = 0;
  for (const cache of sessionCaches.values()) {
    totalThoughts += cache.length;
  }
  return { activeSessions: sessionCaches.size, totalThoughts };
}

/**
 * Purge all sessions (called on shutdown).
 */
export function purgeAllSessions(): void {
  sessionCaches.clear();
  logger.info("[CognitiveEngine] All sessions purged");
}
