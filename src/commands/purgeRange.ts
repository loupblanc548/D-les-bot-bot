/**
 * purgeRange.ts — Commande /admin purge-range
 *
 * Supprime tous les messages entre deux IDs de messages (inclus).
 * Scanne par batches de 100, en plusieurs passes.
 *
 * Usage: /admin purge-range de:"ID_premier_message" a:"ID_dernier_message"
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
import { requestConfirmation } from "../utils/confirm.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("purge-range")
    .setDescription("Supprime tous les messages entre deux IDs (inclus)")
    .addStringOption((o) =>
      o.setName("de").setDescription("ID du premier message à supprimer").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("a").setDescription("ID du dernier message à supprimer").setRequired(true),
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

  const fromId = interaction.options.getString("de", true).trim();
  const toId = interaction.options.getString("a", true).trim();

  if (fromId === toId) {
    await interaction.reply({
      content:
        "❌ Les deux IDs sont identiques. Utilise `/mod clear` pour supprimer un seul message.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

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

  // Valider que les messages existent

  try {
    await channel.messages.fetch(fromId);
  } catch {
    await interaction.reply({
      content: `❌ Le message d'origine (\`${fromId}\`) est introuvable dans ce salon.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  try {
    await channel.messages.fetch(toId);
  } catch {
    await interaction.reply({
      content: `❌ Le message de fin (\`${toId}\`) est introuvable dans ce salon.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Déterminer l'ordre chronologique (Snowflake IDs sont croissants)
  const lowerId = BigInt(fromId) < BigInt(toId) ? fromId : toId;
  const higherId = BigInt(fromId) < BigInt(toId) ? toId : fromId;

  const confirmed = await requestConfirmation(
    interaction,
    `Vous êtes sur le point de supprimer **tous les messages** entre \`${lowerId}\` et \`${higherId}\` (inclus) dans ${channel.toString()}. Cette action est irréversible.`,
  );
  if (!confirmed) return;

  const anim = new LoadingAnimation(interaction, "🧹 Purge par plage en cours");
  await anim.start();

  let totalScanned = 0;
  let totalDeleted = 0;
  let passes = 0;
  const maxPasses = 100;
  let lastMessageId: string | undefined = higherId;
  let reachedStart = false;

  const startTime = Date.now();

  try {
    while (passes < maxPasses && !reachedStart) {
      passes++;

      // Fetch 100 messages before the last scanned message
      const options: { limit: number; before?: string } = { limit: 100 };
      if (lastMessageId) {
        options.before = lastMessageId;
      }

      const messages: Collection<string, Message> = await channel.messages.fetch(options);

      if (messages.size === 0) {
        reachedStart = true;
        break;
      }

      // Track the oldest message for next pagination
      const oldestMsg = messages.last();
      if (oldestMsg) {
        lastMessageId = oldestMsg.id;
      }

      // Check if we've gone past the lower bound
      const oldestId = BigInt(oldestMsg?.id ?? "0");
      if (oldestId < BigInt(lowerId)) {
        reachedStart = true;
      }

      totalScanned += messages.size;

      // Collect IDs to delete: all messages within [lowerId, higherId]
      const toDelete: string[] = [];
      for (const [id, msg] of messages) {
        const idBig = BigInt(id);
        if (idBig >= BigInt(lowerId) && idBig <= BigInt(higherId)) {
          const ageMs = Date.now() - msg.createdTimestamp;
          if (ageMs < 14 * 24 * 60 * 60 * 1000) {
            toDelete.push(id);
          } else {
            try {
              await msg.delete();
              totalDeleted++;
            } catch {
              // Ignore individual delete errors
            }
          }
        }
      }

      // Bulk delete
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
          logger.warn(`[PurgeRange] Bulk delete failed, trying individual: ${String(err)}`);
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

      const progress = reachedStart ? 100 : Math.min(95, Math.round((passes / maxPasses) * 100));
      await anim.update(
        progress,
        `Passe ${passes} • ${totalScanned} scannés • ${totalDeleted} supprimés`,
      );

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const embed = new EmbedBuilder()
      .setTitle("🧹 Purge par plage terminée")
      .setColor(0x00ff00)
      .addFields(
        { name: "Message de début", value: `\`${lowerId}\``, inline: false },
        { name: "Message de fin", value: `\`${higherId}\``, inline: false },
        { name: "Messages scannés", value: `${totalScanned}`, inline: true },
        { name: "Messages supprimés", value: `${totalDeleted}`, inline: true },
        { name: "Passes", value: `${passes}`, inline: true },
        { name: "Temps écoulé", value: `${elapsed}s`, inline: true },
      )
      .setFooter({
        text: reachedStart
          ? "Tous les messages de la plage ont été traités"
          : "Arrêté (limite de passes atteinte)",
      })
      .setTimestamp();

    await anim.stop(embed);

    logger.info(
      `[PurgeRange] ${interaction.user.tag} a supprimé ${totalDeleted} messages entre ${lowerId} et ${higherId} en ${passes} passes (${elapsed}s)`,
    );
  } catch (error) {
    logger.error(`[PurgeRange] Erreur: ${error instanceof Error ? error.message : String(error)}`);
    await anim.stop(
      `❌ Erreur lors de la purge: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
