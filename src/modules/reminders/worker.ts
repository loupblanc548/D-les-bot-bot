import { Worker, Job } from "bullmq";
import { Client, EmbedBuilder } from "discord.js";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD,
};

export function startReminderWorker(client: Client): void {
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
        console.log(`[ReminderWorker] Rappel envoyé à ${userId}: ${raison}`);
      } catch (error) {
        console.error(`[ReminderWorker] Erreur envoi DM à ${job.data.userId}:`, error);
        throw error;
      }
    },
    { connection },
  );

  worker.on("completed", (job) => {
    console.log(`[ReminderWorker] Job ${job.id} complété`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[ReminderWorker] Job ${job?.id} échoué:`, err);
  });

  console.log("[ReminderWorker] Worker démarré");
}
