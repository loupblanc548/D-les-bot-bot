import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import logger from "../../utils/logger.js";
import {
  handleLockdown,
  handleNuke,
  handleCheckAlt,
  handleBlacklist,
  handleRoleMass,
  handleAntiraid,
  handleVerif,
  handleNameHistory,
  handleAvatarHistory,
  handleLinkCheck,
  handleAntiphishing,
} from "./handlers.js";


export const commands = [
  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Verrouille ou déverrouille tous les salons textuels du serveur")
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Activer ou désactiver le lockdown")
        .setRequired(true)
        .addChoices(
          { name: "Verrouiller (Activer)", value: "on" },
          { name: "Déverrouiller (Désactiver)", value: "off" }
       )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Clone le salon actuel et supprime l'ancien pour effacer le spam")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("check-alt")
    .setDescription("Liste les comptes récemment créés ayant rejoint le serveur")
    .addIntegerOption((opt) =>
      opt
        .setName("heures")
        .setDescription("Âge max du compte en heures (défaut: 24h)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(720)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Ajoute ou retire un utilisateur/serveur de la liste noire (Owner)")
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Ajouter ou retirer")
        .setRequired(true)
        .addChoices(
          { name: "Ajouter", value: "add" },
          { name: "Retirer", value: "remove" }
       )
    )
    .addStringOption((opt) =>
      opt
        .setName("cible")
        .setDescription("Type de cible à blacklister")
        .setRequired(true)
        .addChoices(
          { name: "Utilisateur", value: "user" },
          { name: "Serveur", value: "guild" }
       )
    )
    .addStringOption((opt) =>
      opt.setName("id").setDescription("ID Discord de la cible").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("role-mass")
    .setDescription("Ajoute ou retire un rôle à tous les membres du serveur")
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Ajouter ou retirer le rôle")
        .setRequired(true)
        .addChoices(
          { name: "Ajouter", value: "add" },
          { name: "Retirer", value: "remove" }
       )
    )
    .addRoleOption((opt) =>
      opt.setName("rôle").setDescription("Le rôle cible").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  // /antiraid
  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Active/desactive le mode anti-raid")
    .addStringOption((o) =>
      o.setName("action").setDescription("Action").setRequired(true)
        .addChoices(
          { name: "Activer", value: "on" },
          { name: "Desactiver", value: "off" },
          { name: "Statut", value: "status" }
       )
    )
    .addIntegerOption((o) =>
      o.setName("seuil_heures").setDescription("Age max du compte en heures (defaut: 24)").setRequired(false)
        .setMinValue(1).setMaxValue(168)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  // /verif
  new SlashCommandBuilder()
    .setName("verif")
    .setDescription("Cree un panneau de verification par bouton")
    .addRoleOption((o) =>
      o.setName("role").setDescription("Role a donner apres verification").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  // /namehistory
  new SlashCommandBuilder()
    .setName("namehistory")
    .setDescription("Affiche l'historique des changements de pseudo d'un utilisateur")
    .addUserOption((o) =>
      o.setName("utilisateur").setDescription("Utilisateur cible").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  // /avatarhistory
  new SlashCommandBuilder()
    .setName("avatarhistory")
    .setDescription("Affiche l'historique des changements d'avatar d'un utilisateur")
    .addUserOption((o) =>
      o.setName("utilisateur").setDescription("Utilisateur cible").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  // /linkcheck
  new SlashCommandBuilder()
    .setName("linkcheck")
    .setDescription("Verifie si un lien est suspect (phishing, malware, etc.)")
    .addStringOption((o) =>
      o.setName("url").setDescription("URL a verifier").setRequired(true)
    )
    .toJSON(),

  // /antiphishing
];

// ===== Handler principal =====

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
) {
  try {
    switch (interaction.commandName) {
      case "lockdown":
        await handleLockdown(interaction);
        break;
      case "nuke":
        await handleNuke(interaction);
        break;
      case "check-alt":
        await handleCheckAlt(interaction);
        break;
      case "blacklist":
        await handleBlacklist(interaction, client);
        break;
      case "role-mass":
        await handleRoleMass(interaction);
        break;
      case "antiraid":
        await handleAntiraid(interaction);
        break;
      case "verif":
        await handleVerif(interaction);
        break;
      case "namehistory":
        await handleNameHistory(interaction);
        break;
      case "avatarhistory":
        await handleAvatarHistory(interaction);
        break;
      case "linkcheck":
        await handleLinkCheck(interaction);
        break;
      case "antiphishing":
        await handleAntiphishing(interaction);
        break;
    }
  } catch (err) {
    logger.error("[Security] Erreur:", err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff3344)
      .setDescription("Une erreur est survenue lors de l'exécution de la commande.");
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
      }
    } catch {
      // silencieux
    }
  }
}

