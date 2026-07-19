/**
 * privacy.ts — /privacy command (RGPD compliance)
 *
 * Subcommands:
 *  - forget-me: Delete all personal data (with confirmation button)
 *  - export-me: Export all personal data as JSON (sent in DM)
 *  - info: Show what data is stored and retention policy
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import {
  previewUserDeletion,
  forgetUser,
  exportUserData,
  MEMORY_RETENTION_MONTHS,
} from "../services/privacyService.js";
import logger from "../utils/logger.js";

export const data = new SlashCommandBuilder()
  .setName("privacy")
  .setDescription("Gestion de vos données personnelles (RGPD)")
  .addSubcommand((sub) =>
    sub
      .setName("forget-me")
      .setDescription("Supprime toutes vos données personnelles (droit à l'oubli RGPD)"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("export-me")
      .setDescription("Exporte toutes vos données personnelles en JSON (droit d'accès RGPD)"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Affiche quelles données sont stockées et la politique de rétention"),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (subcommand === "info") {
    const embed = new EmbedBuilder()
      .setTitle("🔒 RGPD — Vos données personnelles")
      .setColor(0x5865f2)
      .setDescription(
        [
          "**Données stockées:**",
          "• Mémoire de conversation (faits, messages, embeddings)",
          "• Préférences (jeux, plateformes, notifications)",
          "• Profils liés (Steam, Minecraft)",
          "• Historique (pseudos, avatars, commandes, activité)",
          "• Messages de chat et traductions",
          "• Profil de comportement et de risque",
          "",
          "**Données EXCLUES de la suppression:**",
          "• Sanctions et actions de modération — conservées pour la sécurité du serveur (RGPD Art. 6(1)(f))",
          "",
          `**Politique de rétention:** ${MEMORY_RETENTION_MONTHS} mois sans interaction`,
          "",
          "**Vos droits:**",
          "• `/privacy forget-me` — Supprimer vos données",
          "• `/privacy export-me` — Exporter vos données",
        ].join("\n"),
      )
      .setFooter({ text: "Conformité RGPD — Bot opéré depuis la France" });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "export-me") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const data = await exportUserData(userId);
      const json = JSON.stringify(data, null, 2);

      // Discord attachment limit is ~10MB for files
      const buffer = Buffer.from(json, "utf-8");
      if (buffer.length > 9_000_000) {
        await interaction.editReply({
          content:
            "⚠️ Vos données dépassent la limite de taille. Contactez un administrateur pour un export manuel.",
        });
        return;
      }

      // Send in DM
      const dmChannel = await interaction.user.createDM();
      await dmChannel.send({
        content: "📋 **Export RGPD de vos données personnelles**",
        files: [{ attachment: buffer, name: `rgpd_export_${userId}_${Date.now()}.json` }],
      });

      await interaction.editReply({
        content: "✅ Vos données personnelles ont été exportées et envoyées en DM.",
      });
    } catch (err) {
      logger.error(`[Privacy] export-me error for ${userId}: ${err}`);
      await interaction.editReply({
        content: "❌ Erreur lors de l'export. Vérifiez que vos DM sont ouverts.",
      });
    }
    return;
  }

  if (subcommand === "forget-me") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Step 1: Preview what will be deleted
    const preview = await previewUserDeletion(userId);
    const toDelete = preview.filter((p) => !p.excluded && p.count > 0);
    const excluded = preview.filter((p) => p.excluded);
    const totalToDelete = toDelete.reduce((sum, p) => sum + p.count, 0);

    if (totalToDelete === 0) {
      await interaction.editReply({
        content: "ℹ️ Aucune donnée personnelle à supprimer. Votre profil est déjà vide.",
      });
      return;
    }

    const deleteList = toDelete.map((p) => `• **${p.table}**: ${p.count} entrée(s)`).join("\n");
    const excludedList = excluded
      .filter((p) => p.count > 0)
      .map((p) => `• **${p.table}**: ${p.count} — ${p.reason}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Confirmation de suppression RGPD")
      .setColor(0xed4245)
      .setDescription(
        [
          "**Données qui seront supprimées:**",
          deleteList,
          "",
          "**Données conservées (sécurité du serveur):**",
          excludedList || "• Aucune donnée de modération",
          "",
          "⚠️ **Cette action est irréversible.** Cliquez sur le bouton ci-dessous pour confirmer.",
        ].join("\n"),
      )
      .setFooter({ text: "RGPD Art. 17 — Droit à l'effacement" });

    const confirmButton = new ButtonBuilder()
      .setCustomId("rgpd_confirm_delete")
      .setLabel("Confirmer la suppression")
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId("rgpd_cancel_delete")
      .setLabel("Annuler")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

    const reply = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Wait for button interaction (60 seconds timeout)
    try {
      const buttonInteraction = await reply.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60_000,
      });

      if (buttonInteraction.customId === "rgpd_cancel_delete") {
        await buttonInteraction.update({
          content: "❌ Suppression annulée.",
          embeds: [],
          components: [],
        });
        return;
      }

      // Confirmed — execute deletion
      await buttonInteraction.update({
        content: "⏳ Suppression en cours...",
        embeds: [],
        components: [],
      });

      const result = await forgetUser(userId);

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ Suppression RGPD effectuée")
        .setColor(0x57f287)
        .setDescription(
          [
            `**${result.deletedTables.length}** tables de données supprimées.`,
            "",
            "**Tables supprimées:**",
            result.deletedTables.map((t) => `• ${t}`).join("\n"),
            "",
            "**Tables conservées (sécurité):**",
            result.excludedTables.map((t) => `• ${t}`).join("\n"),
            "",
            `📅 Date: ${result.deletedAt.toISOString()}`,
            "📝 Cette action a été loguée pour preuve de conformité.",
          ].join("\n"),
        )
        .setFooter({ text: "RGPD — Droit à l'oubli exécuté" });

      await buttonInteraction.editReply({
        content: "",
        embeds: [successEmbed],
        components: [],
      });
    } catch {
      // Timeout
      await interaction
        .editReply({
          content: "⏰ Délai de confirmation dépassé. Suppression annulée.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
    }
  }
}
