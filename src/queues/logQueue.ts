/**
 * logQueue.ts — Directive 3: Redis/BullMQ Log Buffering System
 *
 * Routes all log generation (createLog, command logs, telemetry, routine
 * incident auditing) through a BullMQ queue backed by Redis. A dedicated
 * batch worker flushes accumulated payloads into PostgreSQL every 20 seconds,
 * drastically minimizing active concurrent database connections (Prisma P2024).
 *
 * Architecture:
 *  - Producers call `enqueueLog(entry)` — non-blocking, O(1) Redis push
 *  - Batch worker drains queue every 20s or when batch reaches 50 entries
 *  - Uses `prisma.$transaction([])` for batch createMany
 *  - Graceful fallback: if Redis is unavailable, falls back to direct Prisma write
 */

import { Queue, Worker } from "bullmq";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const QUEUE_NAME = "log-buffer";
const FLUSH_INTERVAL_MS = 20_000; // 20 seconds
const MAX_BATCH_SIZE = 50; // flush early if 50 entries accumulate

interface LogEntryPayload {
  type: string;
  action: string;
  userId: string | null;
  targetId: string | null;
  details: string | null;
  moderator: string | null;
  createdAt: string;
}

function parseRedisUrl(): { host: string; port: number; password?: string } | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "6379", 10),
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    };
  } catch {
    return null;
  }
}

const connection = parseRedisUrl();

let logQueue: Queue | null = null;
let logWorker: Worker | null = null;
let isInitialized = false;
let fallbackMode = false;

/**
 * Initialize the log queue and batch worker.
 * Call once at startup.
 */
export function initLogQueue(): void {
  if (isInitialized) return;
  isInitialized = true;

  if (!connection) {
    logger.warn(
      `${CYAN}${BOLD}[LogQueue]${RESET} ${YELLOW}REDIS_URL not configured — falling back to direct Prisma writes${RESET}`,
    );
    fallbackMode = true;
    return;
  }

  try {
    logQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });

    logWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const entries = job.data.entries as LogEntryPayload[];
        if (!entries || entries.length === 0) return;

        await flushBatch(entries);
      },
      {
        connection,
        concurrency: 1,
      },
    );

    logWorker.on("completed", (job) => {
      logger.debug(
        `${CYAN}[LogQueue]${RESET} Batch ${job.id} flushed (${job.data.entries?.length ?? 0} entries)`,
      );
    });

    logWorker.on("failed", (job, err) => {
      logger.error(
        `${CYAN}[LogQueue]${RESET} ${RED}Batch ${job?.id} failed: ${err.message}${RESET}`,
      );
    });

    // Start the batch flush timer
    startBatchTimer();

    logger.info(
      `${CYAN}${BOLD}[LogQueue]${RESET} ${GREEN}Initialized — batching logs every ${FLUSH_INTERVAL_MS / 1000}s (max ${MAX_BATCH_SIZE}/batch)${RESET}`,
    );
  } catch (err) {
    logger.error(
      `${CYAN}${BOLD}[LogQueue]${RESET} ${RED}Init failed: ${err instanceof Error ? err.message : String(err)} — falling back to direct writes${RESET}`,
    );
    fallbackMode = true;
  }
}

// ─── In-memory buffer (flushed by timer or when full) ────────────────────────

const buffer: LogEntryPayload[] = [];
let flushTimer: NodeJS.Timeout | null = null;

function startBatchTimer(): void {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => {
    void flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Enqueue a log entry. Non-blocking — pushes to in-memory buffer.
 * The batch timer or buffer-full trigger will flush to Redis → PostgreSQL.
 */
export function enqueueLog(entry: {
  type: string;
  action: string;
  userId?: string;
  targetId?: string;
  details?: string;
  moderator?: string;
}): void {
  const payload: LogEntryPayload = {
    type: entry.type,
    action: entry.action,
    userId: entry.userId ?? null,
    targetId: entry.targetId ?? null,
    details: entry.details ?? null,
    moderator: entry.moderator ?? null,
    createdAt: new Date().toISOString(),
  };

  if (fallbackMode) {
    // No Redis — write directly to Prisma
    void directWrite(payload);
    return;
  }

  buffer.push(payload);

  // Flush early if buffer is full
  if (buffer.length >= MAX_BATCH_SIZE) {
    void flushBuffer();
  }
}

/**
 * Flush the in-memory buffer to Redis queue.
 */
async function flushBuffer(): Promise<void> {
  if (buffer.length === 0 || !logQueue) return;

  const batch = buffer.splice(0, MAX_BATCH_SIZE);
  if (batch.length === 0) return;

  try {
    await logQueue.add("batch", { entries: batch });
    logger.debug(`${CYAN}[LogQueue]${RESET} Enqueued batch of ${batch.length} log entries`);
  } catch (err) {
    logger.error(
      `${CYAN}[LogQueue]${RESET} ${RED}Failed to enqueue batch: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
    // Put entries back at the front of the buffer
    buffer.unshift(...batch);
  }
}

/**
 * Flush a batch of log entries to PostgreSQL using createMany.
 */
async function flushBatch(entries: LogEntryPayload[]): Promise<void> {
  if (entries.length === 0) return;

  try {
    await prisma.log.createMany({
      data: entries.map((e) => ({
        type: e.type,
        action: e.action,
        userId: e.userId,
        targetId: e.targetId,
        details: e.details,
        moderator: e.moderator,
      })),
      skipDuplicates: true,
    });

    logger.info(
      `${CYAN}[LogQueue]${RESET} ${GREEN}Flushed ${entries.length} log entries to PostgreSQL${RESET}`,
    );
  } catch (err) {
    logger.error(
      `${CYAN}[LogQueue]${RESET} ${RED}Batch flush to PostgreSQL failed: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
    throw err; // Let BullMQ retry
  }
}

/**
 * Direct write fallback when Redis is unavailable.
 */
async function directWrite(entry: LogEntryPayload): Promise<void> {
  try {
    await prisma.log.create({
      data: {
        type: entry.type,
        action: entry.action,
        userId: entry.userId,
        targetId: entry.targetId,
        details: entry.details,
        moderator: entry.moderator,
      },
    });
  } catch (err) {
    logger.error(
      `${CYAN}[LogQueue]${RESET} ${RED}Direct write fallback failed: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
  }
}

/**
 * Gracefully shutdown the log queue.
 */
export async function shutdownLogQueue(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Flush remaining buffer
  if (buffer.length > 0) {
    await flushBuffer();
  }

  if (logWorker) {
    await logWorker.close();
    logWorker = null;
  }

  if (logQueue) {
    await logQueue.close();
    logQueue = null;
  }

  logger.info(`${CYAN}[LogQueue]${RESET} ${YELLOW}Shutdown complete${RESET}`);
}

/**
 * Get queue stats for monitoring.
 */
export function getLogQueueStats(): {
  bufferSize: number;
  fallbackMode: boolean;
  initialized: boolean;
} {
  return {
    bufferSize: buffer.length,
    fallbackMode,
    initialized: isInitialized,
  };
}
