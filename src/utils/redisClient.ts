import { createClient, RedisClientType } from "redis";
import logger from "./logger.js";

const redisUrl = process.env.REDIS_URL || "";
const hasRedis = Boolean(redisUrl);

let client: RedisClientType | null = null;
let connected = false;

if (hasRedis) {
  client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries: number) => Math.min(retries * 500, 5000),
    },
  });

  client.on("error", () => {
    if (connected) {
      logger.warn("[RedisClient] Error — degrading");
      connected = false;
    }
  });
  client.on("ready", () => {
    connected = true;
    logger.info("[RedisClient] Ready");
  });
  client.on("disconnect", () => {
    if (connected) {
      logger.warn("[RedisClient] Disconnected");
      connected = false;
    }
  });
}

export async function ensureConnected(): Promise<RedisClientType | null> {
  if (!client) return null;
  if (connected && client.isOpen) return client;
  if (!client.isOpen) {
    try {
      await client.connect();
      connected = true;
    } catch {
      logger.warn("[RedisClient] Connection failed");
    }
  }
  return connected ? client : null;
}

export async function disconnectAll(): Promise<void> {
  if (client?.isOpen) {
    try {
      await client.quit();
    } catch {
      /* silent */
    }
  }
}

export function isRedisAvailable(): boolean {
  return connected;
}

export { client };
