import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
} from "discord.js";
import { handleCommand as handleAdmin } from "./admin.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";
import { handleCommand as handleCleanDuplicates } from "./clean-duplicates.js";
import { handleCommand as handleMaintenance } from "./maintenance.js";
import { handleCommand as handleChannelRouting } from "./channelRouting.js";
import { handleCommand as handlePurgeContent } from "./purgeContent.js";
import { handleCommand as handleAdvanced } from "./advanced.js";
import { handleAdminExtra } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Commandes d'administration")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) =>
      sc
        .setName("broadcast")
        .setDescription("Message à tous")
        .addStringOption((o) =>
          o.setName("message").setDescription("Le message").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("dm")
        .setDescription("DM à un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("Destinataire").setRequired(true))
        .addStringOption((o) =>
          o.setName("message").setDescription("Le message").setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName("deletehistory").setDescription("Supprime l'historique"))
    .addSubcommand((sc) =>
      sc.setName("maintenance").setDescription("Active/désactive le mode maintenance"),
    )
    .addSubcommand((sc) => sc.setName("clean-duplicates").setDescription("Nettoie les doublons DB"))
    .addSubcommand((sc) => sc.setName("backup").setDescription("Backup manuel de la DB"))
    .addSubcommand((sc) => sc.setName("permission-audit").setDescription("Audit des permissions"))
    .addSubcommand((sc) => sc.setName("guild-config").setDescription("Configuration du serveur"))
    .addSubcommand((sc) =>
      sc.setName("cooldown-config").setDescription("Configuration des cooldowns"),
    )
    .addSubcommand((sc) => sc.setName("channel-routing").setDescription("Routage des salons"))
    .addSubcommand((sc) => sc.setName("purge-content").setDescription("Purge de contenu"))
    .addSubcommand((sc) => sc.setName("api-status").setDescription("Statut des APIs externes"))
    .addSubcommand((sc) => sc.setName("bot-health").setDescription("Health check du bot"))
    .addSubcommand((sc) => sc.setName("healthz").setDescription("Endpoint health"))
    .addSubcommand((sc) => sc.setName("create-workflow").setDescription("Crée un workflow"))
    .addSubcommand((sc) => sc.setName("list-workflows").setDescription("Liste les workflows"))
    .addSubcommand((sc) =>
      sc.setName("toggle-workflow").setDescription("Active/désactive un workflow"),
    )
    // ─── Nouvelles sous-commandes admin ───
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

const ADMIN_SUBS = [
  "broadcast",
  "dm",
  "deletehistory",
  "backup",
  "permission-audit",
  "guild-config",
];
const EXTRA_SUBS = [
  "api-status",
  "bot-health",
  "healthz",
  "create-workflow",
  "list-workflows",
  "toggle-workflow",
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (ADMIN_SUBS.includes(action)) {
    await handleAdmin(interaction);
  } else if (action === "clean-duplicates") {
    await handleCleanDuplicates(interaction);
  } else if (action === "maintenance") {
    await handleMaintenance(interaction, dc);
  } else if (action === "cooldown-config") {
    await handleAdvanced(interaction, dc);
  } else if (action === "channel-routing") {
    await handleChannelRouting(interaction);
  } else if (action === "purge-content") {
    await handlePurgeContent(interaction);
  } else if (EXTRA_SUBS.includes(action)) {
    await handleExtraCmd(interaction, dc);
  } else {
    await handleAdminExtra(interaction, dc);
  }
}
