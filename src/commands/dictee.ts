import logger from "../utils/logger.js";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  Client,
  GuildMember,
  TextChannel,
} from "discord.js";
import { requireAdmin } from "../services/permissions.js";
import {
  startDictation,
  stopDictation,
  hasActiveSession,
  cancelDictation,
} from "../services/dictation.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("dictee")
    .setDescription("Dictée vocale : le bot écoute ta voix et écrit le texte à ta place")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Démarrer ou arrêter la dictée")
        .setRequired(true)
        .addChoices({ name: "▶️ Démarrer", value: "start" }, { name: "⏹️ Arrêter", value: "stop" }),
    )
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon où le texte sera envoyé (requis pour start)")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  if (!(await requireAdmin(interaction))) return;

  const action = interaction.options.getString("action", true);
  const userId = interaction.user.id;

  try {
    // ─── START ──────────────────────────────────────────
    if (action === "start") {
      const member = interaction.member as GuildMember | null;
      if (!member) {
        await interaction.reply({
          content: "❌ Impossible de trouver ton membre sur ce serveur.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const voiceChannel = member.voice.channel;
      if (!voiceChannel) {
        await interaction.reply({
          content: "❌ Tu dois être dans un salon vocal pour utiliser la dictée.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const targetChannel = interaction.options.getChannel("salon");
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content:
            "❌ Tu dois spécifier un salon textuel (option «salon») où le texte sera envoyé.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      try {
        await startDictation(
          voiceChannel.id,
          interaction.guildId!,
          interaction.guild!.voiceAdapterCreator as unknown,
          userId,
          interaction.user.displayName,
          targetChannel.id,
        );

        await interaction.editReply({
          content:
            "🎙️ **Dictée démarrée !** Je t'écoute... Parle dans le micro.\n" +
            "Quand tu as fini, utilise `/dictee stop` pour envoyer le texte dans " +
            `<#${targetChannel.id}>.`,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Erreur de connexion vocale.";
        await interaction.editReply({
          content: "❌ " + errorMsg,
        });
      }

      // ─── STOP ───────────────────────────────────────────
    } else if (action === "stop") {
      if (!hasActiveSession(userId)) {
        await interaction.reply({
          content: "❌ Tu n'as pas de dictée en cours. Utilise `/dictee start` d'abord.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const result = await stopDictation(userId);

      if (!result) {
        await interaction.editReply({
          content: "❌ Aucune dictée trouvée.",
        });
        return;
      }

      // Envoyer le texte dans le salon cible
      try {
        const targetChan = await client.channels.fetch(result.targetChannelId);
        if (targetChan?.isTextBased()) {
          await (targetChan as TextChannel).send({
            content:
              "🗣️ **Dictée vocale de " +
              result.username +
              " :**\n>>> " +
              (result.text || "*(aucun texte détecté)*"),
          });
        }
      } catch (chanErr) {
        logger.error("❌ [Dictation] Impossible d'envoyer dans le salon :", chanErr);
      }

      await interaction.editReply({
        content:
          "✅ **Dictée terminée !** Texte envoyé dans <#" +
          result.targetChannelId +
          ">.\n📊 **Transcription :** " +
          (result.text
            ? '"' + result.text.substring(0, 300) + (result.text.length > 300 ? "..." : "") + '"'
            : "*(aucun texte)*"),
      });
    }
  } catch (error) {
    logger.error("💥 [CRASH DICTEE] Erreur :", error);
    // Cleanup en cas d'erreur
    if (action === "start" || hasActiveSession(userId)) {
      cancelDictation(userId);
    }

    const msg = "❌ Une erreur est survenue pendant la dictée.";
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: msg });
      } else {
        await interaction.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
      }
    } catch {
      await interaction.followUp({ content: msg, flags: [MessageFlags.Ephemeral] }).catch((err) => {
        logger.error("[Dictee] Erreur followUp:", String(err));
      });
    }
  }
}
