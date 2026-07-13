/**
 * bridgeClient.ts — Worker-side WebSocket Client
 *
 * Runs on the Local High-Performance PC (32GB RAM).
 * Connects to the Master VPS bridge server, authenticates,
 * and executes incoming job requests using the bot's own codebase.
 *
 * The worker has direct access to Prisma/Neon DB via DATABASE_URL.
 */

import WebSocket from "ws";
import { createHash, randomUUID } from "crypto";
import logger from "../../utils/logger.js";
import type {
  BridgeMessage,
  BridgeAuthChallenge,
  BridgeJobRequest,
  BridgeJobResult,
  BridgePong,
} from "./bridgeTypes.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const BRIDGE_URL = process.env.BRIDGE_URL || "ws://localhost:9090";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET_TOKEN || "";
const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type JobHandler = (
  job: BridgeJobRequest,
) => Promise<{ content?: string; embedsPayload?: unknown[]; textResult?: string }>;

// ─── State ───────────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let isConnected = false;
let isAuthenticated = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isShuttingDown = false;

const jobHandlers = new Map<string, JobHandler>();

// ─── Stats ───────────────────────────────────────────────────────────────────

let jobsCompleted = 0;
let jobsFailed = 0;
let connectedAt = 0;

export interface WorkerStats {
  workerId: string;
  connected: boolean;
  authenticated: boolean;
  uptime: number;
  jobsCompleted: number;
  jobsFailed: number;
  reconnectAttempts: number;
}

export function getWorkerStats(): WorkerStats {
  return {
    workerId: WORKER_ID,
    connected: isConnected,
    authenticated: isAuthenticated,
    uptime: connectedAt ? Date.now() - connectedAt : 0,
    jobsCompleted,
    jobsFailed,
    reconnectAttempts,
  };
}

// ─── Job Handler Registration ────────────────────────────────────────────────

/**
 * Register a handler for a specific command type.
 */
export function registerJobHandler(command: string, handler: JobHandler): void {
  jobHandlers.set(command, handler);
  logger.info(`[BridgeClient] Registered handler for command: ${command}`);
}

// ─── Message Handling ────────────────────────────────────────────────────────

function sendMessage(msg: BridgeMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleMessage(raw: string): void {
  let msg: BridgeMessage;
  try {
    msg = JSON.parse(raw) as BridgeMessage;
  } catch {
    logger.warn("[BridgeClient] Invalid JSON received");
    return;
  }

  switch (msg.type) {
    case "auth_challenge":
      handleAuthChallenge(msg);
      break;
    case "auth_result":
      handleAuthResult(msg);
      break;
    case "ping":
      handlePing(msg.timestamp);
      break;
    case "job_request":
      void handleJobRequest(msg);
      break;
    default:
      logger.warn(`[BridgeClient] Unknown message type: ${(msg as { type: string }).type}`);
  }
}

function handleAuthChallenge(msg: BridgeAuthChallenge): void {
  // Compute SHA256(challenge + BRIDGE_SECRET)
  const token = createHash("sha256")
    .update(msg.nonce + BRIDGE_SECRET)
    .digest("hex");

  const capabilities = Array.from(jobHandlers.keys());

  sendMessage({
    type: "auth_response",
    token,
    workerId: WORKER_ID,
    capabilities,
  });

  logger.info("[BridgeClient] Auth response sent");
}

function handleAuthResult(msg: { success: boolean; message: string }): void {
  if (msg.success) {
    isAuthenticated = true;
    reconnectAttempts = 0;
    connectedAt = Date.now();
    startHeartbeat();
    logger.info(`[BridgeClient] Authenticated as ${WORKER_ID}`);
  } else {
    logger.error(`[BridgeClient] Auth failed: ${msg.message}`);
    // Don't reconnect on auth failure — likely a config issue
    isShuttingDown = true;
    if (ws) ws.close();
  }
}

function handlePing(timestamp: number): void {
  const mem = process.memoryUsage();
  sendMessage({
    type: "pong",
    timestamp,
    workerLoad: 0, // Could track active jobs / max concurrency
    workerHeapMB: Math.round(mem.heapUsed / (1024 * 1024)),
  } as BridgePong);
}

async function handleJobRequest(job: BridgeJobRequest): Promise<void> {
  const startTime = Date.now();
  logger.info(
    `[BridgeClient] Received job ${job.jobId}: /${job.command}${job.subcommand ? ` ${job.subcommand}` : ""}`,
  );

  try {
    // Find handler
    const handler = jobHandlers.get(job.command);
    if (!handler) {
      throw new Error(`No handler registered for command: ${job.command}`);
    }

    // Execute with timeout
    const result = await Promise.race([
      handler(job),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Job execution timeout")), job.timeoutMs),
      ),
    ]);

    const executionMs = Date.now() - startTime;
    jobsCompleted++;

    const jobResult: BridgeJobResult = {
      type: "job_result",
      jobId: job.jobId,
      status: "success",
      data: {
        content: result.content,
        embedsPayload: result.embedsPayload,
        textResult: result.textResult,
      },
      executionMs,
      workerId: WORKER_ID,
    };

    sendMessage(jobResult);
    logger.info(`[BridgeClient] Job ${job.jobId} completed in ${executionMs}ms`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const executionMs = Date.now() - startTime;
    jobsFailed++;

    const jobResult: BridgeJobResult = {
      type: "job_result",
      jobId: job.jobId,
      status: "failed",
      data: {},
      error: errorMsg,
      executionMs,
      workerId: WORKER_ID,
    };

    sendMessage(jobResult);
    logger.error(`[BridgeClient] Job ${job.jobId} failed: ${errorMsg}`);
  }
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────

function startHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(() => {
    if (!isConnected || !isAuthenticated) return;
    // Pong is sent in response to ping from server
    // But we can also send periodic status updates
  }, HEARTBEAT_INTERVAL_MS);
}

// ─── Connection Management ───────────────────────────────────────────────────

function connect(): void {
  if (isShuttingDown) return;
  if (isConnected) return;

  if (!BRIDGE_SECRET) {
    logger.error("[BridgeClient] BRIDGE_SECRET_TOKEN not set — cannot connect");
    return;
  }

  logger.info(`[BridgeClient] Connecting to ${BRIDGE_URL}...`);

  try {
    ws = new WebSocket(BRIDGE_URL);
  } catch (err) {
    logger.error(
      `[BridgeClient] Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`,
    );
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    isConnected = true;
    logger.info(`[BridgeClient] Connected to bridge at ${BRIDGE_URL}`);
    // Wait for auth challenge from server
  });

  ws.on("message", (data) => {
    handleMessage(data.toString());
  });

  ws.on("close", (code, reason) => {
    isConnected = false;
    isAuthenticated = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    logger.warn(`[BridgeClient] Disconnected (code: ${code}, reason: ${reason.toString()})`);
    if (!isShuttingDown) {
      scheduleReconnect();
    }
  });

  ws.on("error", (err) => {
    logger.error(`[BridgeClient] WebSocket error: ${err.message}`);
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (isShuttingDown) return;

  reconnectAttempts++;
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_MS);

  logger.info(`[BridgeClient] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

  reconnectTimer = setTimeout(() => {
    connect();
  }, delay);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Start the bridge client (Worker mode).
 */
export function startBridgeClient(): void {
  logger.info(`[BridgeClient] Starting worker ${WORKER_ID}`);
  connect();
}

/**
 * Shutdown the bridge client gracefully.
 */
export function stopBridgeClient(): void {
  isShuttingDown = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  isConnected = false;
  isAuthenticated = false;

  logger.info("[BridgeClient] Stopped");
}
