/**
 * mediaWorker.ts — Isolated child process for multimedia & gaming modules
 *
 * This process runs separately from the primary SecOps process.
 * It handles: DisTube/music, audioService, videoStream, Fortnite Party Bot,
 * Minecraft Bedrock Bot, radioGaming.
 *
 * If this process crashes, the primary SecOps stack continues unaffected.
 */

import logger from "../utils/logger.js";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

logger.info(
  `${CYAN}[MediaWorker]${RESET} ${GREEN}Starting isolated media/gaming process...${RESET}`,
);

// ─── Heartbeat to parent process ──────────────────────────────────────────────

let heartbeatInterval: NodeJS.Timeout | null = null;

function startHeartbeat(): void {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    try {
      process.send?.({
        type: "heartbeat",
        data: {
          uptime: process.uptime(),
          memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
      });
    } catch {
      // Parent might be gone
    }
  }, 30_000);
}

// ─── Lazy-load heavy modules ──────────────────────────────────────────────────

async function initModules(): Promise<void> {
  try {
    // Music / DisTube
    const { getDisTube } = await import("../services/musicService.js");
    getDisTube();
    logger.info(`${CYAN}[MediaWorker]${RESET} ${GREEN}DisTube initialized${RESET}`);
  } catch (err) {
    logger.warn(
      `${CYAN}[MediaWorker]${RESET} ${YELLOW}DisTube init failed: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
  }

  try {
    // Video Stream
    const { startVideoStream } = await import("../services/videoStream.js");
    await startVideoStream();
    logger.info(`${CYAN}[MediaWorker]${RESET} ${GREEN}VideoStream initialized${RESET}`);
  } catch (err) {
    logger.warn(
      `${CYAN}[MediaWorker]${RESET} ${YELLOW}VideoStream init failed: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
  }

  try {
    // Stream Watchdog
    const { startStreamWatchdog: startWatchdog } = await import("../services/videoStream.js");
    startWatchdog();
    logger.info(`${CYAN}[MediaWorker]${RESET} ${GREEN}StreamWatchdog initialized${RESET}`);
  } catch (err) {
    logger.warn(
      `${CYAN}[MediaWorker]${RESET} ${YELLOW}StreamWatchdog init failed: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
  }

  // Signal ready
  try {
    process.send?.({ type: "ready" });
  } catch {
    // Parent gone
  }

  startHeartbeat();
}

// ─── Message handler (commands from parent) ───────────────────────────────────

process.on("message", (msg: { type?: string; data?: unknown }) => {
  if (msg?.type === "shutdown") {
    logger.info(`${CYAN}[MediaWorker]${RESET} ${YELLOW}Shutdown received — cleaning up...${RESET}`);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    process.exit(0);
  }
  // Future: handle play/stop/stream commands from parent
});

// ─── Graceful exit ────────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  logger.info(`${CYAN}[MediaWorker]${RESET} ${YELLOW}SIGTERM — exiting gracefully${RESET}`);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  logger.error(`${CYAN}[MediaWorker]${RESET} Uncaught: ${err.message}`);
  try {
    process.send?.({ type: "error", message: err.message });
  } catch {
    // Parent gone
  }
  process.exit(1);
});

// Start initialization
void initModules().catch((err) => {
  logger.error(
    `${CYAN}[MediaWorker]${RESET} Init failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  try {
    process.send?.({
      type: "error",
      message: `Init failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } catch {
    // Parent gone
  }
  process.exit(1);
});
