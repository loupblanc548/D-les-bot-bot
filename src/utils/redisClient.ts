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
      reconnectStrategy: false,
    },
  });

  client.on("error", (_err) => {
    if (connected) {
      logger.warn("[RedisClient] Error — degrading");
      connected = false;
    }
    // Always suppress — prevents ECONNREFUSED spam on console
  });
  // Suppress unhandled socket errors (ECONNREFUSED etc.)
  client.on("connectionError", () => {
    // Silent — prevents console spam when Redis is unreachable
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

/**
 * Wait until Redis is connected AND writable (not a READONLY replica).
 * Retries with exponential backoff. Use before BullMQ Queue/Worker init.
 */
export async function waitForRedisWritable(maxRetries = 5, baseDelayMs = 1000): Promise<boolean> {
  if (!client) return false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const c = await ensureConnected();
    if (c) {
      try {
        // PING verifies connectivity; SET + DEL verifies writability
        const tmpKey = `__ready_check_${Date.now()}`;
        await c.set(tmpKey, "1", { EX: 2 });
        await c.del(tmpKey);
        logger.info(`[RedisClient] Writable check passed (attempt ${attempt})`);
        return true;
      } catch (err) {
        logger.warn(`[RedisClient] Writable check failed (attempt ${attempt}): ${err instanceof Error ? err.message : String(err)}`);
        connected = false;
      }
    }
    if (attempt < maxRetries) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.info(`[RedisClient] Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  logger.warn(`[RedisClient] Writable check failed after ${maxRetries} attempts — BullMQ may encounter READONLY errors`);
  return false;
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
