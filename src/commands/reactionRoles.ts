/**
 * reactionRoles.ts — Commande /reaction-roles
 *
 * Crée des messages avec réactions qui attribuent/retirent des rôles automatiquement.
 * Le bot poste son propre embed propre, réagit avec les emojis, et gère les reactions.
 *
 * Subcommands : create, list, delete, add, remove
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
  ChannelType,
  ColorResolvable,
  MessageReaction,
  User,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Commande ──────────────────────────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("reaction-roles")
    .setDescription("Gère les rôles par réaction (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sc) =>
      sc
        .setName("create")
        .setDescription("Crée un nouveau message de rôles par réaction")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon où poster le message")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((o) =>
          o.setName("titre").setDescription("Titre du message").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Ajoute un rôle à un message de rôles par réaction existant")
        .addStringOption((o) =>
          o.setName("message_id").setDescription("ID du message du bot").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("emoji").setDescription("Emoji à utiliser").setRequired(true),
        )
        .addRoleOption((o) =>
          o.setName("role").setDescription("Rôle à attribuer").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Retire une association emoji/rôle d'un message")
        .addStringOption((o) =>
          o.setName("message_id").setDescription("ID du message du bot").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("emoji").setDescription("Emoji à retirer").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("list").setDescription("Liste tous les messages de rôles par réaction"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("delete")
        .setDescription("Supprime un message de rôles par réaction et ses associations")
        .addStringOption((o) =>
          o.setName("message_id").setDescription("ID du message à supprimer").setRequired(true),
        ),
    )
    .toJSON(),
];

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  try {
    switch (sub) {
      case "create":
        await handleCreate(interaction);
        break;
      case "add":
        await handleAdd(interaction);
        break;
      case "remove":
        await handleRemove(interaction);
        break;
      case "list":
        await handleList(interaction);
        break;
      case "delete":
        await handleDelete(interaction);
        break;
    }
  } catch (error) {
    logger.error("[ReactionRoles] Erreur:", error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Une erreur est survenue." });
      } else {
        await interaction.reply({
          content: "❌ Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

// ─── Create ────────────────────────────────────────────────────────────────────

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel("salon", true) as TextChannel;
  const title = interaction.options.getString("titre", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Créer l'embed de base
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865f2)
    .setDescription(
      "Réagis avec les emojis ci-dessous pour obtenir le rôle correspondant.\n\n*Les rôles seront ajoutés ci-dessous.*",
    )
    .setFooter({ text: "Rôles par réaction • Clique sur un emoji" })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });

  // Sauvegarder en DB
  await prisma.reactionRoleMessage.create({
    data: {
      guildId,
      channelId: channel.id,
      messageId: msg.id,
      title,
    },
  });

  await interaction.editReply({
    content: `✅ Message de rôles par réaction créé dans ${channel} !\nID: \`${msg.id}\`\nUtilise \`/reaction-roles add\` pour ajouter des associations emoji/rôle.`,
  });
  logger.info(
    `[ReactionRoles] Message créé par ${interaction.user.tag} dans ${channel.name} (${msg.id})`,
  );
}

// ─── Add ───────────────────────────────────────────────────────────────────────

async function handleAdd(interaction: ChatInputCommandInteraction) {
  const messageId = interaction.options.getString("message_id", true);
  const emoji = interaction.options.getString("emoji", true);
  const role = interaction.options.getRole("role", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Trouver le message dans la DB
  const rrMsg = await prisma.reactionRoleMessage.findFirst({
    where: { guildId, messageId },
    include: { mappings: true },
  });

  if (!rrMsg) {
    await interaction.editReply({
      content: "❌ Aucun message de rôles par réaction trouvé avec cet ID.",
    });
    return;
  }

  // Vérifier l'emoji (format custom: <name:id> ou unicode)
  const emojiId = extractEmojiId(emoji);

  // Vérifier qu'on ne dépasse pas la limite Discord (20 réactions par message)
  if (rrMsg.mappings.length >= 20) {
    await interaction.editReply({
      content: "❌ Limite de 20 réactions atteinte pour ce message.",
    });
    return;
  }

  // Ajouter l'association en DB
  await prisma.reactionRoleMapping
    .create({
      data: {
        msgId: rrMsg.id,
        emoji: emojiId,
        roleId: role.id,
      },
    })
    .catch(async () => {
      // Si déjà existant, upsert
      await prisma.reactionRoleMapping.upsert({
        where: { msgId_emoji: { msgId: rrMsg.id, emoji: emojiId } },
        update: { roleId: role.id },
        create: { msgId: rrMsg.id, emoji: emojiId, roleId: role.id },
      });
    });

  // Récupérer le message Discord et ajouter la réaction + update l'embed
  const channel = interaction.guild!.channels.cache.get(rrMsg.channelId) as TextChannel | undefined;
  if (channel) {
    const msg = await channel.messages.fetch(rrMsg.messageId).catch(() => null);
    if (msg) {
      await msg.react(emoji).catch(() => {});
      await updateEmbed(msg, rrMsg.id);
    }
  }

  await interaction.editReply({
    content: `✅ Association ajoutée : ${emoji} → ${role.name}`,
  });
  logger.info(
    `[ReactionRoles] ${interaction.user.tag} a ajouté ${emoji} → ${role.name} sur ${messageId}`,
  );
}

// ─── Remove ────────────────────────────────────────────────────────────────────

async function handleRemove(interaction: ChatInputCommandInteraction) {
  const messageId = interaction.options.getString("message_id", true);
  const emoji = interaction.options.getString("emoji", true);
  const guildId = interaction.guildId!;
  const emojiId = extractEmojiId(emoji);

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const rrMsg = await prisma.reactionRoleMessage.findFirst({
    where: { guildId, messageId },
    include: { mappings: true },
  });

  if (!rrMsg) {
    await interaction.editReply({ content: "❌ Message introuvable." });
    return;
  }

  await prisma.reactionRoleMapping.deleteMany({
    where: { msgId: rrMsg.id, emoji: emojiId },
  });

  // Retirer la réaction du message Discord
  const channel = interaction.guild!.channels.cache.get(rrMsg.channelId) as TextChannel | undefined;
  if (channel) {
    const msg = await channel.messages.fetch(rrMsg.messageId).catch(() => null);
    if (msg) {
      await msg.reactions.removeAll().catch(() => {});
      // Re-add remaining reactions
      const remaining = await prisma.reactionRoleMapping.findMany({ where: { msgId: rrMsg.id } });
      for (const m of remaining) {
        await msg.react(m.emoji).catch(() => {});
      }
      await updateEmbed(msg, rrMsg.id);
    }
  }

  await interaction.editReply({ content: `✅ Association ${emoji} retirée.` });
  logger.info(`[ReactionRoles] ${interaction.user.tag} a retiré ${emoji} de ${messageId}`);
}

// ─── List ──────────────────────────────────────────────────────────────────────

async function handleList(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const messages = await prisma.reactionRoleMessage.findMany({
    where: { guildId },
    include: { mappings: true },
    orderBy: { createdAt: "desc" },
  });

  if (messages.length === 0) {
    await interaction.editReply({ content: "Aucun message de rôles par réaction configuré." });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Messages de rôles par réaction")
    .setColor(0x5865f2)
    .setTimestamp();

  for (const msg of messages.slice(0, 10)) {
    const mappingsText =
      msg.mappings.length > 0
        ? msg.mappings.map((m) => `${m.emoji} → <@&${m.roleId}>`).join("\n")
        : "Aucune association";
    embed.addFields({
      name: `${msg.title} — [\`${msg.messageId}\`](${getJumpUrl(msg.guildId, msg.channelId, msg.messageId)})`,
      value: mappingsText,
    });
  }

  if (messages.length > 10) {
    embed.setFooter({ text: `${messages.length} messages au total — 10 affichés` });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ─── Delete ────────────────────────────────────────────────────────────────────

async function handleDelete(interaction: ChatInputCommandInteraction) {
  const messageId = interaction.options.getString("message_id", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const rrMsg = await prisma.reactionRoleMessage.findFirst({
    where: { guildId, messageId },
  });

  if (!rrMsg) {
    await interaction.editReply({ content: "❌ Message introuvable." });
    return;
  }

  // Supprimer le message Discord
  const channel = interaction.guild!.channels.cache.get(rrMsg.channelId) as TextChannel | undefined;
  if (channel) {
    const msg = await channel.messages.fetch(rrMsg.messageId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }

  // Supprimer de la DB (cascade supprime les mappings)
  await prisma.reactionRoleMessage.delete({ where: { id: rrMsg.id } });

  await interaction.editReply({ content: "✅ Message de rôles par réaction supprimé." });
  logger.info(`[ReactionRoles] ${interaction.user.tag} a supprimé ${messageId}`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractEmojiId(emoji: string): string {
  // Format custom: <a:name:id> ou <name:id>
  const customMatch = emoji.match(/<a?:(\w+):(\d+)>/);
  if (customMatch) {
    return customMatch[0]; // Garder le format complet pour réagir
  }
  // Unicode emoji — garder tel quel
  return emoji;
}

function getJumpUrl(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function updateEmbed(msg: import("discord.js").Message, rrMsgId: string) {
  const mappings = await prisma.reactionRoleMapping.findMany({ where: { msgId: rrMsgId } });
  const rrMsg = await prisma.reactionRoleMessage.findUnique({ where: { id: rrMsgId } });
  if (!rrMsg) return;

  const description =
    mappings.length > 0
      ? mappings.map((m) => `${m.emoji} → <@&${m.roleId}>`).join("\n")
      : "*Aucune association pour le moment. Utilise `/reaction-roles add` pour en ajouter.*";

  const embed = new EmbedBuilder()
    .setTitle(rrMsg.title)
    .setColor(0x5865f2 as ColorResolvable)
    .setDescription(description)
    .setFooter({ text: "Rôles par réaction • Clique sur un emoji" })
    .setTimestamp();

  await msg.edit({ embeds: [embed] }).catch(() => {});
}

// ─── Handlers pour les events messageReactionAdd/Remove ────────────────────────

/**
 * Gère l'ajout d'une réaction → attribue le rôle correspondant.
 * Ignorer les réactions du bot lui-même.
 */
export async function handleReactionRoleAdd(reaction: MessageReaction, user: User): Promise<void> {
  if (user.bot) return;

  const message = reaction.message;
  if (!message.guild) return;

  // Vérifier que ce message est un message de rôles par réaction
  const rrMsg = await prisma.reactionRoleMessage.findFirst({
    where: { guildId: message.guild.id, messageId: message.id },
    include: { mappings: true },
  });

  if (!rrMsg) return;

  // Extraire l'identifiant de l'emoji
  const emojiId = reaction.emoji.id
    ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name || "";

  // Trouver l'association emoji → rôle
  const mapping = rrMsg.mappings.find(
    (m) => m.emoji === emojiId || m.emoji === reaction.emoji.name,
  );
  if (!mapping) return;

  // Attribuer le rôle
  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = message.guild.roles.cache.get(mapping.roleId);
  if (!role) return;

  try {
    await member.roles.add(role, "Rôles par réaction");
    logger.info(`[ReactionRoles] + ${user.tag} a reçu le rôle ${role.name} via réaction`);
  } catch (error) {
    logger.error(
      `[ReactionRoles] Impossible d'attribuer le rôle ${role.name} à ${user.tag}:`,
      error,
    );
  }
}

/**
 * Gère le retrait d'une réaction → retire le rôle correspondant.
 */
export async function handleReactionRoleRemove(
  reaction: MessageReaction,
  user: User,
): Promise<void> {
  if (user.bot) return;

  const message = reaction.message;
  if (!message.guild) return;

  const rrMsg = await prisma.reactionRoleMessage.findFirst({
    where: { guildId: message.guild.id, messageId: message.id },
    include: { mappings: true },
  });

  if (!rrMsg) return;

  const emojiId = reaction.emoji.id
    ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name || "";

  const mapping = rrMsg.mappings.find(
    (m) => m.emoji === emojiId || m.emoji === reaction.emoji.name,
  );
  if (!mapping) return;

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = message.guild.roles.cache.get(mapping.roleId);
  if (!role) return;

  try {
    await member.roles.remove(role, "Rôles par réaction (retrait)");
    logger.info(
      `[ReactionRoles] - ${user.tag} a perdu le rôle ${role.name} via retrait de réaction`,
    );
  } catch (error) {
    logger.error(
      `[ReactionRoles] Impossible de retirer le rôle ${role.name} à ${user.tag}:`,
      error,
    );
  }
}
