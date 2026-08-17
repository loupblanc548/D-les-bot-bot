/**
 * Scraper worker skeleton — offload heavy scraping/image tasks to background worker.
 * Uses BullMQ pattern (Redis-backed job queue).
 *
 * Usage:
 *   import { enqueueScrape } from "../workers/scraperWorker.js";
 *   await enqueueScrape({ url: "https://example.com", type: "rss" });
 *
 * Worker process:
 *   node dist/workers/scraperWorker.js
 */

import logger from "../utils/logger.js";

// Lazy import BullMQ — only if Redis is available
let Queue: any = null;
let Worker: any = null;

try {
  const bullmq = await import("bullmq");
  Queue = bullmq.Queue;
  Worker = bullmq.Worker;
} catch {
  logger.info("[ScraperWorker] BullMQ not installed — worker disabled");
}

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = "scraper-tasks";

let queue: any = null;

export function getScrapeQueue(): any | null {
  if (!Queue) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: { url: REDIS_URL },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return queue;
}

export async function enqueueScrape(data: {
  url: string;
  type: string;
  guildId?: string;
  channelId?: string;
}): Promise<string | null> {
  const q = getScrapeQueue();
  if (!q) {
    logger.warn("[ScraperWorker] Queue not available — skipping enqueue");
    return null;
  }
  const job = await q.add("scrape", data);
  return job.id;
}

export function startScraperWorker(handler: (data: any) => Promise<void>): any | null {
  if (!Worker) {
    logger.warn("[ScraperWorker] BullMQ not installed — cannot start worker");
    return null;
  }
  const worker = new Worker(
    QUEUE_NAME,
    async (job: any) => {
      logger.info(`[ScraperWorker] Processing job ${job.id}: ${job.data.url}`);
      await handler(job.data);
      logger.info(`[ScraperWorker] Job ${job.id} completed`);
    },
    {
      connection: { url: REDIS_URL },
      concurrency: 2,
    },
  );

  worker.on("failed", (job: any, err: Error) => {
    logger.error(`[ScraperWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err: Error) => {
    logger.error("[ScraperWorker] Worker error:", err);
  });

  logger.info("[ScraperWorker] Worker started — listening for jobs");
  return worker;
}
