import { createClient } from "redis";
import logger from "../utils/logger.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err: Error) => logger.error("[Redis] Error:", err));
redisClient.on("connect", () => logger.info("[Redis] Connected"));
redisClient.on("disconnect", () => logger.warn("[Redis] Disconnected"));

async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

async function disconnectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
}

async function set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
  await connectRedis();
  await redisClient.set(key, JSON.stringify(value), { EX: ttl });
}

async function get<T>(key: string): Promise<T | null> {
  await connectRedis();
  const data = await redisClient.get(key);
  if (!data) return null;
  return JSON.parse(data) as T;
}

async function del(key: string): Promise<void> {
  await connectRedis();
  await redisClient.del(key);
}

async function clear(): Promise<void> {
  await connectRedis();
  await redisClient.flushDb();
}

export default {
  set,
  get,
  del,
  clear,
  disconnect: disconnectRedis,
};
