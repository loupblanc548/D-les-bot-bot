import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import ms from "ms";
import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD,
};

const remindersQueue = new Queue("reminders", { connection });

export const command = new SlashCommandBuilder()
  .setName("remindme")
  .setDescription("Programme un rappel temporel")
  .addStringOption((option) =>
    option.setName("temps").setDescription("Durée (ex: 10m, 2h, 1d)").setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("raison").setDescription("Raison du rappel").setRequired(true),
  )
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const temps = interaction.options.getString("temps", true);
    const raison = interaction.options.getString("raison", true);
    const userId = interaction.user.id;

    const delay = ms(temps);
    if (!delay || delay <= 0) {
      await interaction.reply({
        content: "❌ Format de temps invalide. Utilisez des formats comme: 10m, 2h, 1d",
        flags: ["Ephemeral"],
      });
      return;
    }

    if (delay > 30 * 24 * 60 * 60 * 1000) {
      await interaction.reply({
        content: "❌ Le rappel ne peut pas dépasser 30 jours",
        flags: ["Ephemeral"],
      });
      return;
    }

    await remindersQueue.add(
      "reminder",
      { userId, raison },
      { delay, attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    const embed = new EmbedBuilder()
      .setTitle("⏰ RAPPEL PROGRAMMÉ")
      .setDescription(`Vous serez notifié dans **${temps}**`)
      .addFields({ name: "Raison", value: raison })
      .setColor(0xffd700)
      .setFooter({ text: "John Helldiver • Super Earth Command" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: ["Ephemeral"] });
  } catch (error) {
    console.error("[RemindMe] Error:", error);
    await interaction.reply({
      content: "❌ Erreur lors de la programmation du rappel",
      flags: ["Ephemeral"],
    });
  }
}
