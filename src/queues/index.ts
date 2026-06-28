import { Queue, Worker, Job } from "bullmq";
import logger from "../utils/logger.js";

// Parse REDIS_URL for BullMQ (which needs host/port, not a URL string)
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

export const dealQueue = connection ? new Queue("deals", { connection }) : null;
export const notificationQueue = connection ? new Queue("notifications", { connection }) : null;
export const reminderQueue = connection ? new Queue("reminders", { connection }) : null;

if (connection) {
  const dealWorker = new Worker(
    "deals",
    async (job: Job) => {
      logger.info(`[DealWorker] Processing job ${job.id}:`, job.name);
      switch (job.name) {
        case "humble_bundle": {
          const { runHumbleBundleCron } = await import("../cron/humbleBundleCron.js");
          await runHumbleBundleCron();
          break;
        }
        case "gmg": {
          const { runGMGCron } = await import("../cron/gmgCron.js");
          await runGMGCron();
          break;
        }
        case "xbox_game_pass": {
          const { runXboxGamePassCron } = await import("../cron/xboxGamePassCron.js");
          await runXboxGamePassCron();
          break;
        }
      }
    },
    { connection },
  );

  dealWorker.on("completed", (job) => {
    logger.info(`[DealWorker] Job ${job.id} completed`);
  });

  dealWorker.on("failed", (job, err) => {
    logger.error(`[DealWorker] Job ${job?.id} failed:`, err);
  });

  const reminderWorker = new Worker(
    "reminders",
    async (job: Job) => {
      logger.info(`[ReminderWorker] Processing job ${job.id}`);
      const { data } = job;
      logger.info(`[ReminderWorker] Sending reminder to user ${data.userId}: ${data.message}`);
    },
    { connection },
  );

  reminderWorker.on("completed", (job) => {
    logger.info(`[ReminderWorker] Job ${job.id} completed`);
  });

  reminderWorker.on("failed", (job, err) => {
    logger.error(`[ReminderWorker] Job ${job?.id} failed:`, err);
  });
} else {
  logger.info("[Queues] REDIS_URL/REDIS_HOST non défini — queues BullMQ désactivées");
}

export async function addDealJob(type: string, data: unknown = {}): Promise<void> {
  if (!dealQueue) return;
  await dealQueue.add(type, data);
}

export async function addReminderJob(data: unknown): Promise<void> {
  if (!reminderQueue) return;
  await reminderQueue.add("send_reminder", data);
}
