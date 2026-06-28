import { createClient, RedisClientType } from "redis";
import NodeCache from "node-cache";
import logger from "../utils/logger.js";

const redisUrl = process.env.REDIS_URL || "";
const hasRedis = Boolean(redisUrl);

const localCache = new NodeCache({ stdTTL: 300, checkperiod: 120 });
let redisConnected = false;
let connectAttempted = false;
let redisClient: RedisClientType | null = null;

if (hasRedis) {
  redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: false,
    },
  });

  redisClient.on("error", () => {
    if (redisConnected) {
      logger.warn("[RedisCache] Error — fallback vers cache local");
      redisConnected = false;
    }
    // Always suppress — prevents unhandled 'error' event crash
  });
  redisClient.on("connect", () => logger.info("[RedisCache] Connected"));
  redisClient.on("ready", () => {
    redisConnected = true;
    logger.info("[RedisCache] Ready");
  });
  redisClient.on("disconnect", () => {
    if (redisConnected) {
      logger.warn("[RedisCache] Disconnected — fallback vers cache local");
      redisConnected = false;
    }
  });
} else {
  logger.info("[RedisCache] REDIS_URL non défini — cache local uniquement");
}

async function connectRedis(): Promise<void> {
  if (!hasRedis || !redisClient) return;
  if (connectAttempted) return;
  connectAttempted = true;
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
    } catch {
      logger.warn("[RedisCache] Connection failed — cache local actif");
    }
  }
}

async function disconnectRedis(): Promise<void> {
  if (redisClient?.isOpen) {
    try {
      await redisClient.quit();
    } catch {
      /* silent */
    }
  }
}

async function set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
  await connectRedis();
  const serialized = JSON.stringify(value);
  try {
    if (redisClient && redisConnected) {
      await redisClient.set(key, serialized, { EX: ttl });
      return;
    }
  } catch {
    /* fallback */
  }
  localCache.set(key, serialized, ttl);
}

async function get<T>(key: string): Promise<T | null> {
  await connectRedis();
  try {
    if (redisClient && redisConnected) {
      const data = await redisClient.get(key);
      if (data) return JSON.parse(data) as T;
      return null;
    }
  } catch {
    /* fallback */
  }
  const local = localCache.get<string>(key);
  if (local) return JSON.parse(local) as T;
  return null;
}

async function del(key: string): Promise<void> {
  await connectRedis();
  try {
    if (redisClient && redisConnected) await redisClient.del(key);
  } catch {
    /* silent */
  }
  localCache.del(key);
}

async function clear(): Promise<void> {
  await connectRedis();
  try {
    if (redisClient && redisConnected) await redisClient.flushDb();
  } catch {
    /* silent */
  }
  localCache.flushAll();
}

export default {
  set,
  get,
  del,
  clear,
  disconnect: disconnectRedis,
};
