/**
 * processIsolator.ts — Anti-Monolith Sharding (Directive 1)
 *
 * Isolates heavy multimedia/gaming modules into a child process
 * so that a crash or memory saturation in DisTube/Gaming cannot
 * stop the SecOps security monitoring loop (Layers 3,4,6,7,8,9,10).
 *
 * Architecture:
 *  - Primary process: SecOps stack (Wazuh, Honeytokens, Active Defense,
 *    Shodan, Git Auto-Healer, VPS Watchdog, Agent IA, Crons sécurité)
 *  - Child process  ("media-worker"): DisTube, audioService, videoStream,
 *    Fortnite Party Bot, Minecraft Bedrock Bot, radioGaming
 *
 * Communication: Node.js `child_process.fork()` with message-passing IPC.
 * The child sends status heartbeats every 30s. If the child dies, it is
 * automatically restarted after a 5s cooldown (max 5 restarts / 10 min).
 */

import { fork, ChildProcess } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const HEARTBEAT_TIMEOUT_MS = 60_000;
const RESTART_COOLDOWN_MS = 5_000;
const MAX_RESTARTS_PER_WINDOW = 5;
const RESTART_WINDOW_MS = 10 * 60 * 1000;

interface MediaWorkerMessage {
  type: "heartbeat" | "ready" | "error" | "log";
  data?: unknown;
  message?: string;
  level?: "info" | "warn" | "error";
}

let mediaWorker: ChildProcess | null = null;
let lastHeartbeat = 0;
let heartbeatTimer: NodeJS.Timeout | null = null;
let restartTimestamps: number[] = [];
let isShuttingDown = false;

/**
 * Start the isolated media/gaming worker process.
 */
export function startMediaWorker(): void {
  if (isShuttingDown) return;

  const workerPath = join(__dirname, "mediaWorker.js");

  // Check if compiled JS exists (production), otherwise use tsx for dev
  const isProduction = process.env.NODE_ENV === "production";
  const execArgv = isProduction ? [] : ["--import", "tsx"];

  logger.info(
    `${CYAN}${BOLD}[ProcessIsolator]${RESET} ${GREEN}Forking media-worker process...${RESET}`,
  );

  try {
    mediaWorker = fork(workerPath, [], {
      execArgv,
      env: {
        ...process.env,
        MEDIA_WORKER_MODE: "true",
      },
      silent: false,
    });
  } catch (err) {
    logger.error(
      `${CYAN}${BOLD}[ProcessIsolator]${RESET} ${RED}Failed to fork media-worker: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
    scheduleRestart();
    return;
  }

  const pid = mediaWorker.pid ?? "unknown";
  logger.info(
    `${CYAN}${BOLD}[ProcessIsolator]${RESET} ${GREEN}Media worker started (PID: ${pid})${RESET}`,
  );

  lastHeartbeat = Date.now();

  // Heartbeat watchdog
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      logger.warn(
        `${CYAN}${BOLD}[ProcessIsolator]${RESET} ${YELLOW}Media worker heartbeat timeout — killing & restarting${RESET}`,
      );
      killAndRestart();
    }
  }, 30_000);

  mediaWorker.on("message", (msg: MediaWorkerMessage) => {
    switch (msg.type) {
      case "heartbeat":
        lastHeartbeat = Date.now();
        break;
      case "ready":
        logger.info(
          `${CYAN}[ProcessIsolator]${RESET} ${GREEN}Media worker ready (PID: ${pid})${RESET}`,
        );
        lastHeartbeat = Date.now();
        break;
      case "log":
        logger.info(`[MediaWorker] ${msg.message ?? ""}`);
        break;
      case "error":
        logger.error(`[MediaWorker] ${msg.message ?? "unknown error"}`);
        break;
    }
  });

  mediaWorker.on("exit", (code, signal) => {
    logger.warn(
      `${CYAN}${BOLD}[ProcessIsolator]${RESET} ${YELLOW}Media worker exited (code=${code}, signal=${signal})${RESET}`,
    );
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (!isShuttingDown) {
      scheduleRestart();
    }
  });

  mediaWorker.on("error", (err) => {
    logger.error(
      `${CYAN}${BOLD}[ProcessIsolator]${RESET} ${RED}Media worker error: ${err.message}${RESET}`,
    );
  });
}

/**
 * Schedule a restart with cooldown and rate-limiting.
 */
function scheduleRestart(): void {
  if (isShuttingDown) return;

  const now = Date.now();
  restartTimestamps = restartTimestamps.filter((t) => now - t < RESTART_WINDOW_MS);

  if (restartTimestamps.length >= MAX_RESTARTS_PER_WINDOW) {
    logger.error(
      `${CYAN}${BOLD}[ProcessIsolator]${RESET} ${RED}${BOLD}Max restarts (${MAX_RESTARTS_PER_WINDOW}) reached in ${RESTART_WINDOW_MS / 60000}min — giving up. SecOps stack continues unaffected.${RESET}`,
    );
    return;
  }

  restartTimestamps.push(now);
  logger.info(
    `${CYAN}[ProcessIsolator]${RESET} ${YELLOW}Restarting media worker in ${RESTART_COOLDOWN_MS / 1000}s... (attempt ${restartTimestamps.length}/${MAX_RESTARTS_PER_WINDOW})${RESET}`,
  );

  setTimeout(() => {
    startMediaWorker();
  }, RESTART_COOLDOWN_MS);
}

/**
 * Kill the current worker and trigger a restart.
 */
function killAndRestart(): void {
  if (mediaWorker) {
    try {
      mediaWorker.kill("SIGKILL");
    } catch {
      // ignore
    }
    mediaWorker = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  scheduleRestart();
}

/**
 * Gracefully shutdown the media worker.
 */
export function stopMediaWorker(): void {
  isShuttingDown = true;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (mediaWorker) {
    logger.info(
      `${CYAN}[ProcessIsolator]${RESET} ${YELLOW}Gracefully stopping media worker...${RESET}`,
    );
    try {
      mediaWorker.send({ type: "shutdown" });
      setTimeout(() => {
        if (mediaWorker) {
          mediaWorker.kill("SIGTERM");
          mediaWorker = null;
        }
      }, 3000);
    } catch {
      try {
        mediaWorker.kill("SIGTERM");
      } catch {
        // ignore
      }
      mediaWorker = null;
    }
  }
}

/**
 * Check if the media worker is alive.
 */
export function isMediaWorkerAlive(): boolean {
  return mediaWorker !== null && !mediaWorker.killed;
}

/**
 * Send a message to the media worker (e.g., play music, stop stream).
 */
export function sendToMediaWorker(msg: Record<string, unknown>): boolean {
  if (!mediaWorker) {
    logger.warn(
      `${CYAN}[ProcessIsolator]${RESET} ${YELLOW}Media worker not running — message dropped${RESET}`,
    );
    return false;
  }
  try {
    mediaWorker.send(msg as unknown as import("child_process").Serializable);
    return true;
  } catch (err) {
    logger.error(
      `${CYAN}[ProcessIsolator]${RESET} ${RED}Failed to send to media worker: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
    return false;
  }
}
