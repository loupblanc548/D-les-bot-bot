import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
} from "discord.js";
import { handleAdminExtra } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("manage")
    .setDescription("Gestion des rôles, salons, emojis et webhooks")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) =>
      sc
        .setName("role-create")
        .setDescription("Crée un rôle")
        .addStringOption((o) => o.setName("nom").setDescription("Nom du rôle").setRequired(true))
        .addStringOption((o) => o.setName("couleur").setDescription("Couleur HEX (ex: #ff5733)").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("role-delete")
        .setDescription("Supprime un rôle")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle à supprimer").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("role-edit")
        .setDescription("Modifie un rôle")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle").setRequired(true))
        .addStringOption((o) => o.setName("parametre").setDescription("Paramètre (nom, couleur, mentionnable)").setRequired(true))
        .addStringOption((o) => o.setName("valeur").setDescription("Nouvelle valeur").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("channel-create")
        .setDescription("Crée un salon")
        .addStringOption((o) => o.setName("nom").setDescription("Nom du salon").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("channel-delete")
        .setDescription("Supprime un salon")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon à supprimer").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("emoji-add")
        .setDescription("Ajoute un emoji depuis une URL")
        .addStringOption((o) => o.setName("url").setDescription("URL de l'image").setRequired(true))
        .addStringOption((o) => o.setName("nom").setDescription("Nom de l'emoji").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("emoji-remove")
        .setDescription("Supprime un emoji")
        .addStringOption((o) => o.setName("emoji").setDescription("Nom ou mention de l'emoji").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("webhook-config")
        .setDescription("Configure un webhook")
        .addChannelOption((o) => o.setName("salon").setDescription("Salon du webhook").setRequired(true))
        .addStringOption((o) => o.setName("action").setDescription("Action (create/delete/list)").setRequired(true)),
    )
    .toJSON(),
];

const MANAGE_SUBS = [
  "role-create",
  "role-delete",
  "role-edit",
  "channel-create",
  "channel-delete",
  "emoji-add",
  "emoji-remove",
  "webhook-config",
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });
  await handleAdminExtra(interaction, dc);
  void MANAGE_SUBS;
}
