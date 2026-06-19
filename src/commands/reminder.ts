import logger from "../utils/logger.js";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import prisma from "../prisma.js";

const FOOTER = { text: "Rappels • Phase 1" };

export const commands = [
  new SlashCommandBuilder()
    .setName("reminder")
    .setDescription("Gérer vos rappels")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Action à effectuer")
        .setRequired(true)
        .addChoices(
          { name: "➕ Créer un rappel", value: "create" },
          { name: "📋 Voir mes rappels", value: "list" },
          { name: "🗑️ Supprimer un rappel", value: "delete" },
        ),
    )
    .addStringOption((option) =>
      option.setName("message").setDescription("Message du rappel").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("time").setDescription("Temps (ex: 10m, 1h, demain 14h)").setRequired(false),
    )
    .addIntegerOption((option) =>
      option.setName("id").setDescription("ID du rappel à supprimer").setRequired(false),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getString("action", true);
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;

  if (!guildId || !channelId) {
    await interaction.reply({
      content: "❌ Cette commande ne peut être utilisée que dans un serveur.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  try {
    if (action === "create") {
      const message = interaction.options.getString("message");
      const time = interaction.options.getString("time");

      if (!message || !time) {
        await interaction.reply({
          content: "❌ Vous devez spécifier un message et un temps.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const triggerAt = parseTime(time);
      if (!triggerAt) {
        await interaction.reply({
          content: "❌ Format de temps invalide. Exemples: 10m, 1h, demain 14h.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (triggerAt <= new Date()) {
        await interaction.reply({
          content: "❌ Le temps doit être dans le futur.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const reminder = await prisma.reminder.create({
        data: {
          userId,
          guildId,
          channelId,
          message,
          triggerAt,
        },
      });

      await interaction.reply({
        content: `✅ Rappel créé pour <t:${Math.floor(triggerAt.getTime() / 1000)}:R> (ID: ${reminder.id})`,
        flags: [MessageFlags.Ephemeral],
      });

      logger.info(`[Reminder] Rappel créé par ${userId}: ${message} à ${triggerAt}`);
    } else if (action === "list") {
      const reminders = await prisma.reminder.findMany({
        where: { userId },
        orderBy: { triggerAt: "asc" },
      });

      if (reminders.length === 0) {
        await interaction.reply({
          content: "📋 Vous n'avez aucun rappel.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Vos rappels")
        .setDescription(
          reminders
            .map(
              (r) =>
                `**${r.id}** - ${r.message}\n⏱️ <t:${Math.floor(r.triggerAt.getTime() / 1000)}:R>`,
            )
            .join("\n\n"),
        )
        .setColor(0x5865f2)
        .setFooter(FOOTER)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    } else if (action === "delete") {
      const id = interaction.options.getInteger("id");

      if (!id) {
        await interaction.reply({
          content: "❌ Vous devez spécifier l'ID du rappel à supprimer.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const reminder = await prisma.reminder.findFirst({
        where: { id, userId },
      });

      if (!reminder) {
        await interaction.reply({
          content: "❌ Rappel introuvable.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await prisma.reminder.delete({ where: { id } });

      await interaction.reply({
        content: `✅ Rappel supprimé (ID: ${id})`,
        flags: [MessageFlags.Ephemeral],
      });

      logger.info(`[Reminder] Rappel supprimé par ${userId}: ${id}`);
    }
  } catch (error) {
    logger.error("[Reminder] Erreur:", error);
    await interaction.reply({
      content: "❌ Erreur lors de l'exécution de la commande.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

function parseTime(timeStr: string): Date | null {
  const now = new Date();
  const lower = timeStr.toLowerCase();

  if (lower.match(/^\d+m$/)) {
    const minutes = parseInt(lower, 10);
    return new Date(now.getTime() + minutes * 60 * 1000);
  }

  if (lower.match(/^\d+h$/)) {
    const hours = parseInt(lower, 10);
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  if (lower.match(/^\d+d$/)) {
    const days = parseInt(lower, 10);
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  if (lower.startsWith("demain")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const match = lower.match(/(\d{1,2})h(\d{2})?/);
    if (match) {
      tomorrow.setHours(parseInt(match[1], 10));
      tomorrow.setMinutes(match[2] ? parseInt(match[2], 10) : 0);
      tomorrow.setSeconds(0);
      tomorrow.setMilliseconds(0);
      return tomorrow;
    }
    return tomorrow;
  }

  return null;
}
