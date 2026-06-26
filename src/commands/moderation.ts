import logger from "../utils/logger.js";
import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  Client,
  TextChannel,
  GuildTextBasedChannel,
  Message,
} from "discord.js";
import prisma from "../prisma.js";
import { createLog } from "../services/logs.js";
import { recordSanction } from "../services/risk-engine.js";
import { requireMod } from "../services/permissions.js";

const FOOTER = { text: "Systeme de Surveillance - v1.0.0" };

// ============================================================
// Definitions des commandes
// ============================================================
export const commands = [
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Avertir un membre")
    .addUserOption((o) =>
      o.setName("cible").setDescription("Le membre a avertir").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("raison").setDescription("Raison de l'avertissement").setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Rendre muet un membre (timeout Discord, longue duree)")
    .addUserOption((o) => o.setName("cible").setDescription("Le membre a mute").setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName("duree")
        .setDescription("Duree en minutes (max 40320 = 28 jours)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320),
    )
    .addStringOption((o) => o.setName("raison").setDescription("Raison du mute").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Retirer le timeout d'un membre")
    .addUserOption((o) => o.setName("cible").setDescription("Le membre a unmute").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulser un membre du serveur")
    .addUserOption((o) =>
      o.setName("cible").setDescription("Le membre a expulser").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("raison").setDescription("Raison de l'expulsion").setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre du serveur")
    .addUserOption((o) => o.setName("cible").setDescription("Le membre a bannir").setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName("jours")
        .setDescription("Jours de messages a supprimer (1-7, defaut: 7)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(7),
    )
    .addStringOption((o) =>
      o.setName("raison").setDescription("Raison du bannissement").setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Mettre un membre en timeout (court terme, secondes)")
    .addUserOption((o) =>
      o.setName("cible").setDescription("Le membre a timeout").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("duree")
        .setDescription("Duree en secondes (max 3600 = 1h)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(3600),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprimer un lot de messages dans le salon")
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de messages a supprimer (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouiller le salon (empeche d'ecrire)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Deverrouiller le salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Banne et debanne instantanement (nettoie les messages)")
    .addUserOption((o) =>
      o.setName("cible").setDescription("Le membre a softban").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("jours")
        .setDescription("Jours de messages a supprimer (1-7, defaut: 7)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(7),
    )
    .addStringOption((o) =>
      o.setName("raison").setDescription("Raison du softban").setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Supprime les messages d'un utilisateur")
    .addUserOption((o) =>
      o.setName("cible").setDescription("L'utilisateur cible").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de messages a supprimer (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Active le slowmode sur le salon")
    .addIntegerOption((o) =>
      o
        .setName("duree")
        .setDescription("Delai entre chaque message en secondes (0 pour desactiver)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Affiche le dernier message supprime")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription("Affiche l'historique des messages recents d'un utilisateur")
    .addUserOption((o) =>
      o.setName("cible").setDescription("L'utilisateur cible").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de messages a afficher (1-50)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),
  // /purgeuser
  new SlashCommandBuilder()
    .setName("purgeuser")
    .setDescription("Purger les messages d'un utilisateur dans tous les salons sans le bannir")
    .addUserOption((o) =>
      o
        .setName("cible")
        .setDescription("Utilisateur dont les messages seront supprimes")
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("jours")
        .setDescription("Jours de messages a supprimer (1-7, defaut: 1)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(7),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),
  // /tempban
  new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Bannir temporairement un membre (deban automatique)")
    .addUserOption((o) =>
      o.setName("cible").setDescription("Le membre a bannir temporairement").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("duree").setDescription("Duree (ex: 1h, 30m, 2j, 7d)").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("jours")
        .setDescription("Jours de messages a supprimer (1-7, defaut: 1)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(7),
    )
    .addStringOption((o) =>
      o.setName("raison").setDescription("Raison du bannissement temporaire").setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .toJSON(),
];

// ============================================================
// Fonctions helper pour les embeds
// ============================================================
function baseEmbed(title: string, color: number): EmbedBuilder {
  return new EmbedBuilder().setTitle(title).setColor(color).setFooter(FOOTER).setTimestamp();
}

function errorEmbed(message: string): EmbedBuilder {
  return baseEmbed("Erreur", 0xff3344).setDescription(message);
}

function _successEmbed(message: string): EmbedBuilder {
  return baseEmbed("Succes", 0x53fc18).setDescription(message);
}

// ============================================================
// Handlers individuels
// ============================================================
async function handleWarn(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const cible = interaction.options.getUser("cible", true);
    const raison = interaction.options.getString("raison") || "Aucune raison fournie";

    await prisma.sanction.create({
      data: {
        guildId: interaction.guildId!,
        userId: cible.id,
        moderatorId: interaction.user.id,
        reason: raison,
        type: "WARN",
      },
    });

    // Enregistrer dans le risk-engine
    await recordSanction(cible.id, interaction.guildId!, "WARN");

    const embed = baseEmbed("Avertissement", 0xffaa00)
      .setDescription(
        "- **Membre** : " +
          cible.tag +
          " (" +
          cible.id +
          ")\n- **Moderateur** : " +
          interaction.user.tag +
          "\n- **Raison** : " +
          raison,
      )
      .addFields({ name: "Action", value: "Avertissement enregistre", inline: true });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE WARN]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible d'avertir ce membre.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible d'avertir ce membre.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

async function handleMute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const cible = interaction.options.getMember("cible");
    const dureeMin = interaction.options.getInteger("duree", true);
    const raison = interaction.options.getString("raison") || "Aucune raison fournie";

    if (!cible || !("timeout" in cible)) {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de mute ce membre.")] });
      return;
    }

    const dureeMs = dureeMin * 60 * 1000;
    await cible.timeout(dureeMs, raison);

    // Enregistrer dans le risk-engine
    await recordSanction(cible.user.id, interaction.guildId!, "TIMEOUT");

    const embed = baseEmbed("Mute", 0xff3344).setDescription(
      "- **Membre** : " +
        cible.user.tag +
        "\n- **Moderateur** : " +
        interaction.user.tag +
        "\n- **Duree** : " +
        dureeMin +
        " minute(s)\n- **Raison** : " +
        raison,
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE MUTE]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de mute ce membre.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible de mute ce membre.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

async function handleUnmute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const cible = interaction.options.getMember("cible");

    if (!cible || !("timeout" in cible)) {
      await interaction.editReply({ embeds: [errorEmbed("Impossible d'unmute ce membre.")] });
      return;
    }

    await cible.timeout(null);

    const embed = baseEmbed("Unmute", 0x53fc18).setDescription(
      "- **Membre** : " + cible.user.tag + "\n- **Moderateur** : " + interaction.user.tag,
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE UNMUTE]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible d'unmute ce membre.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible d'unmute ce membre.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

async function handleKick(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const cible = interaction.options.getMember("cible");
    const raison = interaction.options.getString("raison") || "Aucune raison fournie";

    if (!cible || !("kickable" in cible)) {
      await interaction.editReply({ embeds: [errorEmbed("Impossible d'expulser ce membre.")] });
      return;
    }

    await cible.kick(raison);

    // Enregistrer dans le risk-engine
    await recordSanction(cible.user.id, interaction.guildId!, "KICK");

    const embed = baseEmbed("Expulsion", 0xffaa00).setDescription(
      "- **Membre** : " +
        cible.user.tag +
        " (" +
        cible.id +
        ")\n- **Moderateur** : " +
        interaction.user.tag +
        "\n- **Raison** : " +
        raison,
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE KICK]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible d'expulser ce membre.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible d'expulser ce membre.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

async function handleBan(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const cible = interaction.options.getUser("cible", true);
    const raison = interaction.options.getString("raison") || "Aucune raison fournie";
    const jours = interaction.options.getInteger("jours") || 7;
    const deleteMessageSeconds = jours * 86400;

    await interaction.guild!.members.ban(cible, { reason: raison, deleteMessageSeconds });

    // Enregistrer dans le risk-engine
    await recordSanction(cible.id, interaction.guildId!, "BAN");

    const embed = baseEmbed("Bannissement", 0xff3344).setDescription(
      "- **Membre** : " +
        cible.tag +
        " (" +
        cible.id +
        ")\n- **Moderateur** : " +
        interaction.user.tag +
        "\n- **Raison** : " +
        raison +
        "\n- **Messages supprimes** : " +
        jours +
        " jour" +
        (jours > 1 ? "s" : ""),
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE BAN]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de bannir ce membre.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible de bannir ce membre.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

async function handleTimeout(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const cible = interaction.options.getMember("cible");
    const dureeSec = interaction.options.getInteger("duree", true);

    if (!cible || !("timeout" in cible)) {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de timeout ce membre.")] });
      return;
    }

    const dureeMs = dureeSec * 1000;
    await cible.timeout(dureeMs, "Timeout par " + interaction.user.tag);

    const embed = baseEmbed("Timeout", 0xffaa00).setDescription(
      "- **Membre** : " +
        cible.user.tag +
        "\n- **Moderateur** : " +
        interaction.user.tag +
        "\n- **Duree** : " +
        dureeSec +
        " seconde(s)",
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE TIMEOUT]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de timeout ce membre.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible de timeout ce membre.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

// Deja protege
async function handleClear(interaction: ChatInputCommandInteraction) {
  const nombre = interaction.options.getInteger("nombre", true);
  const channel = interaction.channel as TextChannel;

  if (!channel) {
    await interaction.reply({
      embeds: [errorEmbed("Salon introuvable.")],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const deleted = await channel.bulkDelete(nombre, true);

  const embed = baseEmbed("Nettoyage", 0x2f3136).setDescription(
    "- **Salon** : " + channel.name + "\n- **Messages supprimes** : " + deleted.size + "/" + nombre,
  );

  await interaction.editReply({ embeds: [embed] });
}

async function handleLock(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const channel = interaction.channel as TextChannel;

    if (!channel) {
      await interaction.editReply({ embeds: [errorEmbed("Salon introuvable.")] });
      return;
    }

    await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
      SendMessages: false,
    });

    const embed = baseEmbed("Salon verrouille", 0xff3344).setDescription(
      "- **Salon** : " + channel.name + "\n- **Moderateur** : " + interaction.user.tag,
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE LOCK]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de verrouiller le salon.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible de verrouiller le salon.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

async function handleUnlock(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const channel = interaction.channel as TextChannel;

    if (!channel) {
      await interaction.editReply({ embeds: [errorEmbed("Salon introuvable.")] });
      return;
    }

    await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
      SendMessages: null,
    });

    const embed = baseEmbed("Salon deverrouille", 0x53fc18).setDescription(
      "- **Salon** : " + channel.name + "\n- **Moderateur** : " + interaction.user.tag,
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE UNLOCK]:", error);
    try {
      await interaction.editReply({
        embeds: [errorEmbed("Impossible de deverrouiller le salon.")],
      });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible de deverrouiller le salon.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

async function handleSoftban(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const cible = interaction.options.getUser("cible", true);
    const raison = interaction.options.getString("raison") || "Aucune raison fournie";
    const _jours = interaction.options.getInteger("jours") || 7;

    if (!cible) {
      await interaction.editReply({ embeds: [errorEmbed("Utilisateur introuvable.")] });
      return;
    }

    await interaction.guild!.members.ban(cible, { reason: raison, deleteMessageSeconds: 604800 });
    await interaction.guild!.members.unban(cible, "Softban automatique");

    const embed = baseEmbed("Softban", 0xffaa00).setDescription(
      "- **Membre** : " +
        cible.tag +
        " (" +
        cible.id +
        ")\n- **Moderateur** : " +
        interaction.user.tag +
        "\n- **Raison** : " +
        raison +
        "\n- **Messages supprimes** : 7 jours",
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE SOFTBAN]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de softban ce membre.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible de softban ce membre.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

// Deja protege
async function handlePurge(interaction: ChatInputCommandInteraction) {
  const cible = interaction.options.getUser("cible", true);
  const nombre = interaction.options.getInteger("nombre", true);
  const channel = interaction.channel as TextChannel;

  if (!channel) {
    await interaction.reply({
      embeds: [errorEmbed("Salon introuvable.")],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const userMessages = messages.filter((m) => m.author.id === cible.id);
    const toDelete = userMessages.first(nombre);

    if (!toDelete || toDelete.length === 0) {
      await interaction.editReply({
        embeds: [errorEmbed("Aucun message de cet utilisateur trouve.")],
      });
      return;
    }

    await channel.bulkDelete(toDelete);

    const embed = baseEmbed("Purge", 0x2f3136).setDescription(
      "- **Salon** : " +
        channel.name +
        "\n- **Utilisateur** : " +
        cible.tag +
        "\n- **Messages supprimes** : " +
        toDelete.length,
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[Purge] Erreur:", error);
    await interaction.editReply({ embeds: [errorEmbed("Impossible de supprimer les messages.")] });
  }
}

async function handleSlowmode(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const duree = interaction.options.getInteger("duree", true);
    const channel = interaction.channel as TextChannel;

    if (!channel) {
      await interaction.editReply({ embeds: [errorEmbed("Salon introuvable.")] });
      return;
    }

    await channel.setRateLimitPerUser(duree);

    const embed = baseEmbed(
      duree === 0 ? "Slowmode desactive" : "Slowmode active",
      duree === 0 ? 0x53fc18 : 0xffaa00,
    ).setDescription(
      "- **Salon** : " +
        channel.name +
        "\n- **Delai** : " +
        (duree === 0 ? "Aucun" : duree + " secondes") +
        "\n- **Moderateur** : " +
        interaction.user.tag,
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE SLOWMODE]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de modifier le slowmode.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible de modifier le slowmode.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

// Deja protege
async function handleSnipe(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel as TextChannel;

  if (!channel) {
    await interaction.reply({
      embeds: [errorEmbed("Salon introuvable.")],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const deletedMessages = messages.filter((m) => m.author.bot);

    if (deletedMessages.size === 0) {
      await interaction.editReply({
        embeds: [errorEmbed("Aucun message supprime recent trouve.")],
      });
      return;
    }

    const lastDeleted = deletedMessages.first();

    const embed = baseEmbed("Dernier message supprime", 0x2f3136)
      .setDescription(lastDeleted?.content || "Contenu vide")
      .addFields(
        { name: "Auteur", value: lastDeleted?.author.tag || "Inconnu", inline: true },
        {
          name: "Date",
          value: lastDeleted?.createdAt.toLocaleString("fr-FR") || "Inconnue",
          inline: true,
        },
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[Snipe] Erreur:", error);
    await interaction.editReply({ embeds: [errorEmbed("Impossible de recuperer le message.")] });
  }
}

// Deja protege
async function handleHistory(interaction: ChatInputCommandInteraction) {
  const cible = interaction.options.getUser("cible", true);
  const nombre = interaction.options.getInteger("nombre") || 10;
  const channel = interaction.channel as TextChannel;

  if (!channel) {
    await interaction.reply({
      embeds: [errorEmbed("Salon introuvable.")],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const userMessages = messages.filter((m) => m.author.id === cible.id);
    const recentMessages = userMessages.first(nombre);

    if (!recentMessages || recentMessages.length === 0) {
      await interaction.editReply({
        embeds: [errorEmbed("Aucun message de cet utilisateur trouve.")],
      });
      return;
    }

    const messageList = recentMessages
      .map(
        (m, i) =>
          "**" +
          (i + 1) +
          ".** " +
          m.createdAt.toLocaleString("fr-FR") +
          "\n" +
          m.content.slice(0, 100),
      )
      .join("\n\n");

    const embed = baseEmbed("Historique des messages", 0x2f3136)
      .setDescription(
        "- **Utilisateur** : " +
          cible.tag +
          "\n- **Messages** : " +
          recentMessages.length +
          "/" +
          nombre +
          "\n\n" +
          messageList.slice(0, 4000),
      )
      .setFooter({ text: "Salon : " + channel.name + " - " + FOOTER.text });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[History] Erreur:", error);
    await interaction.editReply({ embeds: [errorEmbed("Impossible de recuperer l'historique.")] });
  }
}

// ============================================================
// /tempban
// ============================================================
async function handleTempban(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const cible = interaction.options.getUser("cible", true);
    const dureeStr = interaction.options.getString("duree", true);
    const jours = interaction.options.getInteger("jours") || 1;
    const raison = interaction.options.getString("raison") || "Aucune raison fournie";

    const match = dureeStr.match(/^(\d+)\s*(m|min|h|j|d)$/i);
    if (!match) {
      await interaction.editReply({
        embeds: [errorEmbed("Format de duree invalide. Exemples : 1h, 30m, 2j, 7d")],
      });
      return;
    }

    const valeur = parseInt(match[1]);
    const unite = match[2].toLowerCase();
    let dureeMs: number;
    let dureeHumaine: string;

    switch (unite) {
      case "m":
      case "min":
        dureeMs = valeur * 60 * 1000;
        dureeHumaine = valeur + " minute(s)";
        break;
      case "h":
        dureeMs = valeur * 60 * 60 * 1000;
        dureeHumaine = valeur + " heure(s)";
        break;
      case "j":
      case "d":
        dureeMs = valeur * 24 * 60 * 60 * 1000;
        dureeHumaine = valeur + " jour(s)";
        break;
      default:
        dureeMs = valeur * 60 * 60 * 1000;
        dureeHumaine = valeur + " heure(s)";
    }

    if (dureeMs > 28 * 24 * 60 * 60 * 1000) {
      await interaction.editReply({
        embeds: [errorEmbed("La duree maximale est de 28 jours.")],
      });
      return;
    }

    const deleteMessageSeconds = jours * 86400;
    const dateFin = new Date(Date.now() + dureeMs);

    await interaction.guild!.members.ban(cible, { reason: raison, deleteMessageSeconds });

    await createLog({
      type: "tempban",
      action: cible.tag + " banni temporairement (" + dureeHumaine + ")",
      userId: cible.id,
      moderator: interaction.user.id,
      details: raison,
    });

    setTimeout(async () => {
      try {
        await interaction.guild!.members.unban(cible, "Tempban expire");
        logger.info("[Tempban] " + cible.tag + " automatiquement debanni");
      } catch (err) {
        logger.error("[Tempban] Erreur deban automatique de " + cible.tag + ":", err);
      }
    }, dureeMs);

    const embed = baseEmbed("Bannissement Temporaire", 0xff6600).setDescription(
      "- **Membre** : " +
        cible.tag +
        " (" +
        cible.id +
        ")\n- **Moderateur** : " +
        interaction.user.tag +
        "\n- **Duree** : " +
        dureeHumaine +
        "\n- **Deban automatique** : <t:" +
        Math.floor(dateFin.getTime() / 1000) +
        ":F>\n- **Raison** : " +
        raison +
        "\n- **Messages supprimes** : " +
        jours +
        " jour(s)",
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE TEMPBAN]:", error);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Impossible de bannir ce membre.")] });
    } catch {
      try {
        await interaction.followUp({
          embeds: [errorEmbed("Impossible de bannir ce membre.")],
          ephemeral: true,
        });
      } catch (err) {
        logger.warn("[Moderation] Erreur followUp:", String(err));
      }
    }
  }
}

// ============================================================
// /purgeuser
// ============================================================
async function handlePurgeUser(interaction: ChatInputCommandInteraction) {
  const cible = interaction.options.getUser("cible", true);
  const jours = interaction.options.getInteger("jours") || 1;

  // Reponse immediate pour eviter le timeout
  const embedProgress = baseEmbed("Purge en cours", 0xffaa00).setDescription(
    "Scan des salons pour supprimer les messages de **" +
      cible.tag +
      "** (" +
      jours +
      " jour" +
      (jours > 1 ? "s" : "") +
      ")...",
  );
  await interaction.deferReply();
  await interaction.editReply({ embeds: [embedProgress] });

  let totalDeleted = 0;
  let channelsScanned = 0;

  try {
    const textChannels = interaction.guild!.channels.cache.filter((ch) => ch.isTextBased());

    for (const [, channel] of textChannels) {
      const botMember = interaction.guild!.members.me;
      if (
        !botMember
          ?.permissionsIn(channel.id)
          .has(["ViewChannel", "ReadMessageHistory", "ManageMessages"])
      ) {
        continue;
      }

      try {
        channelsScanned++;
        const chan = channel as GuildTextBasedChannel;
        const messages = await chan.messages.fetch({ limit: 100 });
        const userMessages = messages.filter((msg: Message) => msg.author.id === cible.id);

        if (userMessages.size > 0) {
          try {
            const deleted = await chan.bulkDelete(userMessages, true);
            totalDeleted += deleted.size;
          } catch (bulkErr: unknown) {
            logger.warn(
              "[PurgeUser] BulkDelete impossible dans #" + chan.name + " :",
              (bulkErr as Error).message,
            );
          }
        }
      } catch (fetchErr: unknown) {
        logger.warn(
          "[PurgeUser] Fetch impossible dans #" + (channel as GuildTextBasedChannel).name + " :",
          (fetchErr as Error).message,
        );
        continue;
      }
    }
  } catch (err) {
    logger.error("[CRASH COMMANDE PURGEUSER]:", err);
  }

  const embedFinal = baseEmbed("Purge Terminee", totalDeleted > 0 ? 0x00ff66 : 0xffaa00)
    .setDescription("Purge des messages de **" + cible.tag + "** terminee.")
    .addFields(
      { name: "Messages supprimes", value: "" + totalDeleted, inline: true },
      { name: "Salons scannes", value: "" + channelsScanned, inline: true },
      { name: "Periode", value: jours + " jour" + (jours > 1 ? "s" : ""), inline: true },
    );

  await interaction.editReply({ embeds: [embedFinal] });
}

// ============================================================
// Routeur principal
// ============================================================
export async function handleCommand(interaction: ChatInputCommandInteraction, _client: Client) {
  try {
    await requireMod(interaction);

    switch (interaction.commandName) {
      case "warn":
        await handleWarn(interaction);
        break;
      case "mute":
        await handleMute(interaction);
        break;
      case "unmute":
        await handleUnmute(interaction);
        break;
      case "kick":
        await handleKick(interaction);
        break;
      case "ban":
        await handleBan(interaction);
        break;
      case "timeout":
        await handleTimeout(interaction);
        break;
      case "clear":
        await handleClear(interaction);
        break;
      case "lock":
        await handleLock(interaction);
        break;
      case "unlock":
        await handleUnlock(interaction);
        break;
      case "softban":
        await handleSoftban(interaction);
        break;
      case "purge":
        await handlePurge(interaction);
        break;
      case "slowmode":
        await handleSlowmode(interaction);
        break;
      case "snipe":
        await handleSnipe(interaction);
        break;
      case "history":
        await handleHistory(interaction);
        break;
      case "purgeuser":
        await handlePurgeUser(interaction);
        break;
      case "tempban":
        await handleTempban(interaction);
        break;
      default:
        await interaction.reply({
          content: "Commande de moderation inconnue.",
          flags: [MessageFlags.Ephemeral],
        });
    }
  } catch (err) {
    logger.error("[Moderation] Erreur:", String(err));
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [errorEmbed("Une erreur est survenue lors de l'execution.")],
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
}
