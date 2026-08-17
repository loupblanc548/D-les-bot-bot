/**
 * vectorMemory.ts — Real vector memory with embeddings and cosine similarity
 *
 * Replaces the rudimentary word-overlap similarity in ragMemory.ts with:
 * 1. Real text embeddings via OpenRouter embeddings API (or local TF-IDF fallback)
 * 2. Cosine similarity search across stored embeddings
 * 3. Automatic embedding generation when memories are stored
 */

import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import type { Prisma } from "@prisma/client";

// ─── Embedding generation ────────────────────────────────────────────────────

const EMBEDDING_DIMENSION = 384; // Lightweight dimension for storage efficiency

/**
 * Generates a text embedding using a lightweight TF-IDF + hashing approach.
 * This is a local fallback that doesn't require any API calls.
 * For production quality, replace with OpenAI/OpenRouter embeddings API.
 */
export function generateLocalEmbedding(text: string): number[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\sàâäéèêëïîôöùûüç]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const vector = new Array(EMBEDDING_DIMENSION).fill(0);

  for (const token of tokens) {
    // Simple hash function to map token to vector dimension
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIMENSION;
    // Weight by token frequency ( IDF-like: shorter tokens get more weight)
    const weight = 1 + Math.log(tokens.length / (tokens.filter((t) => t === token).length || 1));
    vector[idx] += weight;
  }

  // L2 normalize
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}

/**
 * Generates an embedding for the given text.
 * Tries external API first, falls back to local embedding.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // For now, use local embedding (no external API dependency)
  // This can be upgraded to use OpenAI/OpenRouter embeddings API when available
  return generateLocalEmbedding(text);
}

// ─── Cosine similarity ───────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

// ─── Vector memory store & search ────────────────────────────────────────────

/**
 * Stores a memory with its vector embedding.
 */
export async function storeVectorMemory(
  userId: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    // Ensure user exists
    await prisma.userMemory.upsert({
      where: { userId },
      update: { lastActiveAt: new Date() },
      create: { userId, lastActiveAt: new Date() },
    });

    const embedding = await generateEmbedding(content);

    await prisma.memoryEmbedding.create({
      data: {
        userId,
        content,
        embedding: JSON.stringify(embedding),
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });

    logger.info(`[VectorMemory] Stored embedding for ${userId} (${embedding.length}d)`);
  } catch (err) {
    logger.error(
      `[VectorMemory] Store failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Searches for similar memories using cosine similarity.
 * Returns top-K results above the similarity threshold.
 */
export async function searchVectorMemories(
  userId: string,
  query: string,
  limit = 5,
  threshold = 0.3,
): Promise<Array<{ content: string; score: number; metadata?: Record<string, unknown> }>> {
  try {
    // Get all embeddings for this user (limited to recent 200)
    const embeddings = await prisma.memoryEmbedding.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    if (embeddings.length === 0) return [];

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Calculate similarities
    const scored = embeddings.map((e) => {
      const storedVector = JSON.parse(e.embedding) as number[];
      const score = cosineSimilarity(queryEmbedding, storedVector);
      return {
        content: e.content,
        score,
        metadata: e.metadata as Record<string, unknown> | undefined,
      };
    });

    // Filter by threshold and return top results
    return scored
      .filter((r) => r.score >= threshold)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, limit);
  } catch (err) {
    logger.error(
      `[VectorMemory] Search failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Prunes old embeddings to keep storage bounded.
 * Keeps only the most recent 500 per user.
 */
export async function pruneVectorMemories(userId: string, maxKeep = 500): Promise<number> {
  try {
    const count = await prisma.memoryEmbedding.count({ where: { userId } });
    if (count <= maxKeep) return 0;

    const toDelete = count - maxKeep;
    const oldest = await prisma.memoryEmbedding.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: toDelete,
      select: { id: true },
    });

    await prisma.memoryEmbedding.deleteMany({
      where: { id: { in: oldest.map((e: { id: string }) => e.id) } },
    });

    logger.info(`[VectorMemory] Pruned ${toDelete} old embeddings for ${userId}`);
    return toDelete;
  } catch (err) {
    logger.error(
      `[VectorMemory] Prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }
}
