import inMemoryCache from "./cache.js";
import redisCache from "./redisCache.js";
import logger from "../utils/logger.js";

interface CacheOptions {
  memoryTTL?: number;
  redisTTL?: number;
  skipRedis?: boolean;
}

async function get<T>(key: string): Promise<T | null> {
  try {
    const memoryValue = inMemoryCache.get<T>(key);
    if (memoryValue !== null) {
      return memoryValue;
    }

    const redisValue = await redisCache.get<T>(key);
    if (redisValue !== null) {
      inMemoryCache.set(key, redisValue, 300000);
      return redisValue;
    }

    return null;
  } catch (error) {
    logger.error("[MultiLevelCache] Error getting:", error);
    return null;
  }
}

async function set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
  try {
    const { memoryTTL = 300000, redisTTL = 300, skipRedis = false } = options;

    inMemoryCache.set(key, value, memoryTTL);

    if (!skipRedis) {
      await redisCache.set(key, value, redisTTL);
    }
  } catch (error) {
    logger.error("[MultiLevelCache] Error setting:", error);
  }
}

async function del(key: string): Promise<void> {
  try {
    inMemoryCache.delete(key);
    await redisCache.del(key);
  } catch (error) {
    logger.error("[MultiLevelCache] Error deleting:", error);
  }
}

async function clear(): Promise<void> {
  try {
    inMemoryCache.clear();
    await redisCache.clear();
  } catch (error) {
    logger.error("[MultiLevelCache] Error clearing:", error);
  }
}

export default {
  get,
  set,
  del,
  clear,
};
