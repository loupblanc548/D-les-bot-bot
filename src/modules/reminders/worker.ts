import { Worker, Job, QueueEvents } from "bullmq";
import logger from "../../utils/logger.js";
import { Client, EmbedBuilder } from "discord.js";

const hasRedis = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

export function startReminderWorker(client: Client): void {
  if (!hasRedis) {
    logger.info("[ReminderWorker] REDIS non configuré — worker désactivé");
    return;
  }
  const connection = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD,
  };

  const worker = new Worker(
    "reminders",
    async (job: Job) => {
      try {
        const { userId, raison } = job.data;

        const user = await client.users.fetch(userId);
        const embed = new EmbedBuilder()
          .setTitle("⏰ RAPPEL - JOHN HELLDIVER")
          .setDescription(raison)
          .setColor(0xffd700)
          .addFields({ name: "Mission", value: "Terminé" })
          .setFooter({ text: "Super Earth Command • Democracy Managed" })
          .setTimestamp();

        await user.send({ embeds: [embed] });
        logger.info(`[ReminderWorker] Rappel envoyé à ${userId}: ${raison}`);
      } catch (error) {
        logger.error(`[ReminderWorker] Erreur envoi DM à ${job.data.userId}:`, error);
        throw error;
      }
    },
    {
      connection,
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 0, age: 24 * 3600 },
    },
  );

  const queueEvents = new QueueEvents("reminders", { connection });

  queueEvents.on("completed", (job) => {
    logger.info(`[ReminderWorker] Job ${job.jobId} complété`);
  });

  queueEvents.on("failed", (job, err) => {
    logger.error(`[ReminderWorker] Job ${job?.jobId} échoué:`, err);
  });

  worker.on("completed", (job) => {
    logger.info(`[ReminderWorker] Job ${job.id} complété`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`[ReminderWorker] Job ${job?.id} échoué:`, err);
  });

  logger.info("[ReminderWorker] Worker démarré");
}
