/**
 * bridgeServer.ts — Master VPS WebSocket Bridge Server
 *
 * Hosted on the German production VPS. Listens for connections from the
 * Local PC Worker. Handles authentication, heartbeat, and job routing.
 *
 * Memory-safe: pending job promises are cleaned up on timeout or disconnect.
 */

import { WebSocketServer, WebSocket } from "ws";
import { randomUUID, createHash } from "crypto";
import logger from "../../utils/logger.js";
import type {
  BridgeMessage,
  BridgeAuthChallenge,
  BridgeAuthResponse,
  BridgeAuthResult,
  BridgePong,
  BridgeJobResult,
  BridgeWorkerStatus,
} from "./bridgeTypes.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || "9090", 10);
const BRIDGE_SECRET = process.env.BRIDGE_SECRET_TOKEN || "";
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const MAX_WORKERS = 3;

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkerConnection {
  ws: WebSocket;
  workerId: string;
  authenticated: boolean;
  lastPong: number;
  capabilities: string[];
  jobsCompleted: number;
  jobsFailed: number;
  connectedAt: number;
  heapMB: number;
  load: number;
}

// ─── State ───────────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;
const workers = new Map<string, WorkerConnection>();
const pendingChallenges = new Map<WebSocket, string>();

// Pending job callbacks — jobId → { resolve, reject, timeout }
interface PendingJob {
  resolve: (result: BridgeJobResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
const pendingJobs = new Map<string, PendingJob>();

let isInitialized = false;

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface BridgeServerStats {
  workersConnected: number;
  workersOnline: number;
  pendingJobs: number;
  totalJobsDispatched: number;
  totalJobsCompleted: number;
  totalJobsFailed: number;
}

let totalJobsDispatched = 0;
let totalJobsCompleted = 0;
let totalJobsFailed = 0;

export function getBridgeServerStats(): BridgeServerStats {
  let online = 0;
  for (const w of workers.values()) {
    if (w.authenticated && Date.now() - w.lastPong < HEARTBEAT_TIMEOUT_MS) online++;
  }
  return {
    workersConnected: workers.size,
    workersOnline: online,
    pendingJobs: pendingJobs.size,
    totalJobsDispatched,
    totalJobsCompleted,
    totalJobsFailed,
  };
}

// ─── Authentication ──────────────────────────────────────────────────────────

function generateChallenge(): string {
  return randomUUID();
}

function verifyAuthResponse(challenge: string, token: string): boolean {
  // The worker should send back SHA256(challenge + BRIDGE_SECRET)
  const expected = createHash("sha256")
    .update(challenge + BRIDGE_SECRET)
    .digest("hex");
  return token === expected;
}

// ─── Message Handling ────────────────────────────────────────────────────────

function sendMessage(ws: WebSocket, msg: BridgeMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleMessage(ws: WebSocket, raw: string): void {
  let msg: BridgeMessage;
  try {
    msg = JSON.parse(raw) as BridgeMessage;
  } catch {
    logger.warn("[BridgeServer] Invalid JSON received");
    return;
  }

  // Unauthenticated — only accept auth_response
  if (msg.type !== "auth_response" && !isAuthenticated(ws)) {
    logger.warn(`[BridgeServer] Unauthenticated message: ${msg.type}`);
    return;
  }

  switch (msg.type) {
    case "auth_response":
      handleAuthResponse(ws, msg);
      break;
    case "pong":
      handlePong(ws, msg);
      break;
    case "job_result":
      handleJobResult(msg);
      break;
    case "worker_status":
      handleWorkerStatus(ws, msg);
      break;
    default:
      logger.warn(`[BridgeServer] Unknown message type: ${(msg as { type: string }).type}`);
  }
}

function isAuthenticated(ws: WebSocket): boolean {
  for (const w of workers.values()) {
    if (w.ws === ws) return w.authenticated;
  }
  return false;
}

function getWorkerByWs(ws: WebSocket): WorkerConnection | null {
  for (const w of workers.values()) {
    if (w.ws === ws) return w;
  }
  return null;
}

function handleAuthResponse(ws: WebSocket, msg: BridgeAuthResponse): void {
  const challenge = pendingChallenges.get(ws);
  if (!challenge) {
    sendMessage(ws, {
      type: "auth_result",
      success: false,
      message: "No pending challenge",
    } as BridgeAuthResult);
    return;
  }

  pendingChallenges.delete(ws);

  if (workers.size >= MAX_WORKERS) {
    sendMessage(ws, {
      type: "auth_result",
      success: false,
      message: "Max workers reached",
    } as BridgeAuthResult);
    ws.close();
    return;
  }

  if (!verifyAuthResponse(challenge, msg.token)) {
    sendMessage(ws, {
      type: "auth_result",
      success: false,
      message: "Invalid auth token",
    } as BridgeAuthResult);
    ws.close();
    logger.warn("[BridgeServer] Worker auth failed — invalid token");
    return;
  }

  const worker: WorkerConnection = {
    ws,
    workerId: msg.workerId,
    authenticated: true,
    lastPong: Date.now(),
    capabilities: msg.capabilities,
    jobsCompleted: 0,
    jobsFailed: 0,
    connectedAt: Date.now(),
    heapMB: 0,
    load: 0,
  };

  workers.set(msg.workerId, worker);

  sendMessage(ws, {
    type: "auth_result",
    success: true,
    message: "Authenticated",
  } as BridgeAuthResult);

  logger.info(`[BridgeServer] Worker ${msg.workerId} authenticated (${workers.size} online)`);
}

function handlePong(ws: WebSocket, msg: BridgePong): void {
  const worker = getWorkerByWs(ws);
  if (worker) {
    worker.lastPong = Date.now();
    worker.heapMB = msg.workerHeapMB;
    worker.load = msg.workerLoad;
  }
}

function handleJobResult(msg: BridgeJobResult): void {
  const pending = pendingJobs.get(msg.jobId);
  if (!pending) {
    logger.warn(`[BridgeServer] Received result for unknown job ${msg.jobId}`);
    return;
  }

  clearTimeout(pending.timeout);
  pendingJobs.delete(msg.jobId);

  // Update worker stats
  for (const w of workers.values()) {
    if (msg.status === "success") {
      w.jobsCompleted++;
      totalJobsCompleted++;
    } else {
      w.jobsFailed++;
      totalJobsFailed++;
    }
  }

  pending.resolve(msg);
  logger.info(`[BridgeServer] Job ${msg.jobId} resolved: ${msg.status} (${msg.executionMs}ms)`);
}

function handleWorkerStatus(_ws: WebSocket, _msg: BridgeWorkerStatus): void {
  // Worker status updates are handled via pong
}

// ─── Connection Handling ─────────────────────────────────────────────────────

function handleNewConnection(ws: WebSocket): void {
  logger.info("[BridgeServer] New WebSocket connection");

  // Send auth challenge
  const challenge = generateChallenge();
  pendingChallenges.set(ws, challenge);

  sendMessage(ws, {
    type: "auth_challenge",
    nonce: challenge,
    timestamp: Date.now(),
  } as BridgeAuthChallenge);

  // Set auth timeout (30s to respond)
  const authTimeout = setTimeout(() => {
    if (pendingChallenges.has(ws)) {
      pendingChallenges.delete(ws);
      logger.warn("[BridgeServer] Auth timeout — closing connection");
      ws.close();
    }
  }, 30_000);

  ws.on("close", () => {
    clearTimeout(authTimeout);
    handleDisconnect(ws);
  });

  ws.on("message", (data) => {
    handleMessage(ws, data.toString());
  });

  ws.on("error", (err) => {
    logger.error(`[BridgeServer] WebSocket error: ${err.message}`);
    handleDisconnect(ws);
  });
}

function handleDisconnect(ws: WebSocket): void {
  pendingChallenges.delete(ws);

  // Find and remove the worker
  let disconnectedWorkerId: string | null = null;
  for (const [workerId, worker] of workers) {
    if (worker.ws === ws) {
      disconnectedWorkerId = workerId;
      break;
    }
  }

  if (disconnectedWorkerId) {
    workers.delete(disconnectedWorkerId);
    logger.warn(
      `[BridgeServer] Worker ${disconnectedWorkerId} disconnected (${workers.size} remaining)`,
    );

    // Reject all pending jobs assigned to this worker
    for (const [jobId, pending] of pendingJobs) {
      clearTimeout(pending.timeout);
      pendingJobs.delete(jobId);
      pending.reject(new Error(`Worker ${disconnectedWorkerId} disconnected`));
    }
  }
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function startHeartbeat(): void {
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const [workerId, worker] of workers) {
      if (now - worker.lastPong > HEARTBEAT_TIMEOUT_MS) {
        logger.warn(`[BridgeServer] Worker ${workerId} heartbeat timeout — marking offline`);
        worker.ws.terminate();
        handleDisconnect(worker.ws);
      } else {
        sendMessage(worker.ws, {
          type: "ping",
          timestamp: now,
        });
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

// ─── Job Dispatch ────────────────────────────────────────────────────────────

/**
 * Select the best available worker (lowest load).
 */
function selectWorker(): WorkerConnection | null {
  let best: WorkerConnection | null = null;
  let bestLoad = Infinity;

  for (const worker of workers.values()) {
    if (!worker.authenticated) continue;
    if (Date.now() - worker.lastPong > HEARTBEAT_TIMEOUT_MS) continue;
    if (worker.load < bestLoad) {
      bestLoad = worker.load;
      best = worker;
    }
  }

  return best;
}

/**
 * Check if any worker is online and ready.
 */
export function isWorkerOnline(): boolean {
  return selectWorker() !== null;
}

/**
 * Dispatch a job to a worker and return a promise that resolves with the result.
 * Cleans up automatically on timeout.
 */
export function dispatchJob(
  command: string,
  subcommand: string | undefined,
  payload: {
    options: Record<string, unknown>;
    userId: string;
    guildId: string;
    channelId: string;
    username: string;
    locale: string;
  },
  timeoutMs = 30_000,
): Promise<BridgeJobResult> {
  return new Promise((resolve, reject) => {
    const worker = selectWorker();
    if (!worker) {
      reject(new Error("No worker available"));
      return;
    }

    const jobId = randomUUID();
    totalJobsDispatched++;

    // Set timeout
    const timeout = setTimeout(() => {
      pendingJobs.delete(jobId);
      totalJobsFailed++;
      reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`));
      logger.warn(`[BridgeServer] Job ${jobId} timed out`);
    }, timeoutMs);

    // Register pending callback
    pendingJobs.set(jobId, { resolve, reject, timeout });

    // Send job request
    sendMessage(worker.ws, {
      type: "job_request",
      jobId,
      command,
      subcommand,
      payload,
      timeoutMs,
      createdAt: Date.now(),
    });

    logger.info(`[BridgeServer] Job ${jobId} dispatched to worker ${worker.workerId} (${command})`);
  });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Initialize the bridge server on the Master VPS.
 */
export function startBridgeServer(): void {
  if (isInitialized) {
    logger.warn("[BridgeServer] Already initialized");
    return;
  }

  if (!BRIDGE_SECRET) {
    logger.warn("[BridgeServer] BRIDGE_SECRET_TOKEN not set — bridge disabled");
    return;
  }

  wss = new WebSocketServer({ port: BRIDGE_PORT });

  wss.on("connection", (ws) => {
    handleNewConnection(ws);
  });

  wss.on("error", (err) => {
    logger.error(`[BridgeServer] Server error: ${err.message}`);
  });

  startHeartbeat();
  isInitialized = true;

  logger.info(`[BridgeServer] Listening on port ${BRIDGE_PORT} (max ${MAX_WORKERS} workers)`);
}

/**
 * Shutdown the bridge server and clean up all resources.
 */
export function stopBridgeServer(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Reject all pending jobs
  for (const [_jobId, pending] of pendingJobs) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Bridge server shutting down"));
  }
  pendingJobs.clear();

  // Close all worker connections
  for (const worker of workers.values()) {
    worker.ws.terminate();
  }
  workers.clear();
  pendingChallenges.clear();

  if (wss) {
    wss.close();
    wss = null;
  }

  isInitialized = false;
  logger.info("[BridgeServer] Stopped");
}
