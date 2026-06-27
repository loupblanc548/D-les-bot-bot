/**
 * purgeContent.ts — Commande /purge-content
 *
 * Supprime TOUS les messages contenant un texte spécifique.
 * Scanne par batches de 100 messages, en plusieurs passes, jusqu'à tout supprimer.
 *
 * Usage: /purge-content contenu:"texte à chercher"
 *
 * Permissions: Administrateur uniquement.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
  PermissionFlagsBits,
  Collection,
  Message,
} from "discord.js";
import logger from "../utils/logger.js";
import { LoadingAnimation } from "../utils/loadingAnimation.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("purge-content")
    .setDescription("Supprime tous les messages contenant un texte spécifique")
    .addStringOption((o) =>
      o
        .setName("contenu")
        .setDescription("Le texte à rechercher dans les messages")
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("limite")
        .setDescription("Nombre max de messages à scanner par passe (défaut: 100, max: 100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channel) {
    await interaction.reply({
      content: "❌ Cette commande doit être utilisée dans un salon de serveur.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const searchText = interaction.options.getString("contenu", true).toLowerCase();
  const batchSize = interaction.options.getInteger("limite") ?? 100;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "❌ Vous devez être administrateur pour utiliser cette commande.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const channel = interaction.channel as TextChannel;

  // Vérifier les permissions du bot
  const botMember = await interaction.guild?.members.fetchMe();
  if (!botMember?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({
      content: "❌ Je n'ai pas la permission de supprimer des messages dans ce salon.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const anim = new LoadingAnimation(interaction, "🧹 Purge en cours");
  await anim.start();

  let totalScanned = 0;
  let totalDeleted = 0;
  let passes = 0;
  const maxPasses = 50; // Safety: max 50 passes (5000 messages)
  let lastMessageId: string | undefined = undefined;
  let noMoreMessages = false;

  const startTime = Date.now();

  try {
    while (passes < maxPasses && !noMoreMessages) {
      passes++;

      // Fetch 100 messages (before the last scanned message if pagination)
      const options: { limit: number; before?: string } = { limit: batchSize };
      if (lastMessageId) {
        options.before = lastMessageId;
      }

      const messages: Collection<string, Message> = await channel.messages.fetch(options);

      if (messages.size === 0) {
        noMoreMessages = true;
        break;
      }

      // Track the oldest message for next pagination
      const oldestMsg = messages.last();
      if (oldestMsg) {
        lastMessageId = oldestMsg.id;
      }

      totalScanned += messages.size;

      // Filter messages matching the search text
      const toDelete: string[] = [];
      for (const [id, msg] of messages) {
        const content = msg.content.toLowerCase();
        if (content.includes(searchText)) {
          // Discord: can only bulk delete messages < 14 days old
          const ageMs = Date.now() - msg.createdTimestamp;
          if (ageMs < 14 * 24 * 60 * 60 * 1000) {
            toDelete.push(id);
          } else {
            // Delete individually (older than 14 days)
            try {
              await msg.delete();
              totalDeleted++;
            } catch {
              // Ignore individual delete errors
            }
          }
        }
      }

      // Bulk delete (max 100 per call, only if 2+ messages)
      if (toDelete.length === 1) {
        try {
          await channel.messages.delete(toDelete[0]);
          totalDeleted++;
        } catch {
          // Ignore
        }
      } else if (toDelete.length > 1) {
        try {
          const deleted = await channel.bulkDelete(toDelete, true);
          totalDeleted += deleted.size;
        } catch (err) {
          // If bulk fails, try individual deletes
          logger.warn(`[PurgeContent] Bulk delete failed, trying individual: ${String(err)}`);
          for (const id of toDelete) {
            try {
              await channel.messages.delete(id);
              totalDeleted++;
            } catch {
              // Ignore
            }
          }
        }
      }

      // Si on a récupéré moins de messages que demandé, on a atteint la fin
      if (messages.size < batchSize) {
        noMoreMessages = true;
      }

      // Animation update
      const progress = noMoreMessages ? 100 : Math.min(95, Math.round((passes / maxPasses) * 100));
      await anim.update(
        progress,
        `Passe ${passes} • ${totalScanned} scannés • ${totalDeleted} supprimés`,
      );

      // Petit délai pour éviter le rate limit Discord
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const embed = new EmbedBuilder()
      .setTitle("🧹 Purge terminée")
      .setColor(0x00ff00)
      .addFields(
        { name: "Texte recherché", value: `\`${searchText.slice(0, 100)}\``, inline: false },
        { name: "Messages scannés", value: `${totalScanned}`, inline: true },
        { name: "Messages supprimés", value: `${totalDeleted}`, inline: true },
        { name: "Passes", value: `${passes}`, inline: true },
        { name: "Temps écoulé", value: `${elapsed}s`, inline: true },
      )
      .setFooter({
        text: noMoreMessages
          ? "Tous les messages ont été scannés"
          : "Arrêté (limite de passes atteinte)",
      })
      .setTimestamp();

    await anim.stop(embed);

    logger.info(
      `[PurgeContent] ${interaction.user.tag} a supprimé ${totalDeleted}/${totalScanned} messages contenant "${searchText.slice(0, 50)}" en ${passes} passes (${elapsed}s)`,
    );
  } catch (error) {
    logger.error(
      `[PurgeContent] Erreur: ${error instanceof Error ? error.message : String(error)}`,
    );
    await anim.stop(
      `❌ Erreur lors de la purge: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
