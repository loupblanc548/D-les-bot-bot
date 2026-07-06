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
import { handleCommand as handlePurgeRange } from "./purgeRange.js";
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
    .addSubcommand((sc) =>
      sc
        .setName("purge-range")
        .setDescription("Supprime tous les messages entre deux IDs (inclus)")
        .addStringOption((o) => o.setName("de").setDescription("ID du premier message").setRequired(true))
        .addStringOption((o) => o.setName("a").setDescription("ID du dernier message").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("api-status").setDescription("Statut des APIs externes"))
    .addSubcommand((sc) => sc.setName("bot-health").setDescription("Health check du bot"))
    .addSubcommand((sc) => sc.setName("healthz").setDescription("Endpoint health"))
    .addSubcommand((sc) => sc.setName("create-workflow").setDescription("Crée un workflow"))
    .addSubcommand((sc) => sc.setName("list-workflows").setDescription("Liste les workflows"))
    .addSubcommand((sc) =>
      sc.setName("toggle-workflow").setDescription("Active/désactive un workflow"),
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
  } else if (action === "purge-range") {
    await handlePurgeRange(interaction);
  } else if (EXTRA_SUBS.includes(action)) {
    await handleExtraCmd(interaction, dc);
  } else {
    await handleAdminExtra(interaction, dc);
  }
}
