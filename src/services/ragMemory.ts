import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import multiLevelCache from "./multiLevelCache.js";
import { searchVectorMemories, storeVectorMemory } from "./vectorMemory.js";

interface MemoryContext {
  userId: string;
  guildId?: string;
  facts: Array<{ key: string; value: string; weight: number }>;
  messages: Array<{ role: string; content: string; timestamp: Date }>;
  embeddings: Array<{ content: string; embedding: number[] }>;
}

const CACHE_PREFIX = "rag_memory";
const CACHE_TTL = 600;

export async function getUserMemory(userId: string, guildId?: string): Promise<MemoryContext> {
  try {
    const cacheKey = `${CACHE_PREFIX}:${userId}:${guildId || "global"}`;
    const cached = await multiLevelCache.get<MemoryContext>(cacheKey);
    if (cached) {
      return cached;
    }

    const userMemory = await prisma.userMemory.findUnique({
      where: { userId },
      include: {
        facts: { orderBy: { weight: "desc" } },
        messages: { orderBy: { createdAt: "desc" }, take: 50 },
        embeddings: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    if (!userMemory) {
      const context: MemoryContext = {
        userId,
        guildId,
        facts: [],
        messages: [],
        embeddings: [],
      };
      await multiLevelCache.set(cacheKey, context, { redisTTL: CACHE_TTL });
      return context;
    }

    const context: MemoryContext = {
      userId,
      guildId,
      facts: userMemory.facts.map((f) => ({ key: f.key, value: f.value, weight: f.weight })),
      messages: userMemory.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      })),
      embeddings: userMemory.embeddings.map((e) => ({
        content: e.content,
        embedding: JSON.parse(e.embedding),
      })),
    };

    await multiLevelCache.set(cacheKey, context, { redisTTL: CACHE_TTL });
    return context;
  } catch (error) {
    logger.error("[RAGMemory] Error getting user memory:", error);
    return { userId, guildId, facts: [], messages: [], embeddings: [] };
  }
}

export async function addMemoryFact(
  userId: string,
  key: string,
  value: string,
  weight: number = 1.0,
  category?: string,
): Promise<void> {
  try {
    await prisma.userMemory.upsert({
      where: { userId },
      update: { lastActiveAt: new Date() },
      create: { userId, lastActiveAt: new Date() },
    });

    await prisma.memoryFact.upsert({
      where: { userId_key: { userId, key } },
      update: { value, weight, category, accessedAt: new Date(), accessCount: { increment: 1 } },
      create: { userId, key, value, weight, category },
    });

    await invalidateCache(userId);
    logger.info(`[RAGMemory] Added fact for ${userId}: ${key}`);
  } catch (error) {
    logger.error("[RAGMemory] Error adding memory fact:", error);
  }
}

export async function addMemoryMessage(
  userId: string,
  role: string,
  content: string,
  channelId?: string,
  tokens?: number,
): Promise<void> {
  try {
    await prisma.userMemory.upsert({
      where: { userId },
      update: { lastActiveAt: new Date() },
      create: { userId, lastActiveAt: new Date() },
    });

    await prisma.memoryMessage.create({
      data: { userId, role, content, channelId, tokens },
    });

    await invalidateCache(userId);
    logger.info(`[RAGMemory] Added message for ${userId}: ${role}`);
  } catch (error) {
    logger.error("[RAGMemory] Error adding memory message:", error);
  }
}

export async function addMemoryEmbedding(
  userId: string,
  content: string,
  embedding?: number[],
  metadata?: any,
): Promise<void> {
  try {
    if (embedding && embedding.length > 0) {
      // Use provided embedding
      await prisma.userMemory.upsert({
        where: { userId },
        update: { lastActiveAt: new Date() },
        create: { userId, lastActiveAt: new Date() },
      });

      await prisma.memoryEmbedding.create({
        data: {
          userId,
          content,
          embedding: JSON.stringify(embedding),
          metadata: metadata as any,
        },
      });
    } else {
      // Auto-generate embedding via vector memory service
      await storeVectorMemory(userId, content, metadata);
    }

    await invalidateCache(userId);
    logger.info(`[RAGMemory] Added embedding for ${userId}`);
  } catch (error) {
    logger.error("[RAGMemory] Error adding memory embedding:", error);
  }
}

export async function searchRelevantMemories(
  userId: string,
  query: string,
  limit: number = 5,
): Promise<Array<{ content: string; score: number }>> {
  try {
    // Use real vector cosine similarity search
    const results = await searchVectorMemories(userId, query, limit, 0.3);
    return results.map((r) => ({ content: r.content, score: r.score }));
  } catch (error) {
    logger.error("[RAGMemory] Error searching memories:", error);
    return [];
  }
}

async function invalidateCache(userId: string): Promise<void> {
  const keys = await multiLevelCache.get<string[]>(`${CACHE_PREFIX}:keys:${userId}`);
  if (keys) {
    for (const key of keys) {
      await multiLevelCache.del(key);
    }
  }
}
