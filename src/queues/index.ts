import { Queue, Worker, Job } from "bullmq";
import logger from "../utils/logger.js";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD,
};

export const dealQueue = new Queue("deals", { connection });

export const notificationQueue = new Queue("notifications", { connection });

export const reminderQueue = new Queue("reminders", { connection });

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

export async function addDealJob(type: string, data: unknown = {}): Promise<void> {
  await dealQueue.add(type, data);
}

export async function addReminderJob(data: unknown): Promise<void> {
  await reminderQueue.add("send_reminder", data);
}
