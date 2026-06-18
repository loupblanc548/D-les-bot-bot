import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./utils/logger.js";
import { config } from "./config.js";
import { dedupCache } from "./utils/deduplicationCache.js";

/**
 * Starts the HTTP control server (health/metrics endpoints).
 * Stub implementation pending — see TODO and ARCHITECTURE.md for the
 * intended responsibilities. Signature matches the call site in
 * src/bot.ts line ~72.
 */
export async function startControlServer(_port: number, _client: unknown): Promise<void> { logger.warn("[control-server] STUB: HTTP control server not implemented; port=blank, /health and /metrics endpoints will not respond.");
  // TODO: implement HTTP control server (health, metrics, /stop endpoint).
  // Returning immediately so the bot can still boot under strict mode.
  return;
}

/**
 * Stops the HTTP control server gracefully.
 * Stub implementation pending.
 */
export async function stopControlServer(): Promise<void> { logger.warn("[control-server] STUB: stopControlServer invoked but not implemented.");
  // TODO: implement graceful shutdown.
  return;
}
