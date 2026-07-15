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
        .setName("dm")
        .setDescription("DM à un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("Destinataire").setRequired(true))
        .addStringOption((o) =>
          o.setName("message").setDescription("Le message").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("maintenance").setDescription("Active/désactive le mode maintenance"),
    )
    .addSubcommand((sc) => sc.setName("clean-duplicates").setDescription("Nettoie les doublons DB"))
    .addSubcommand((sc) => sc.setName("backup").setDescription("Backup manuel de la DB"))
    .addSubcommand((sc) => sc.setName("guild-config").setDescription("Configuration du serveur"))
    .addSubcommand((sc) => sc.setName("channel-routing").setDescription("Routage des salons"))
    .addSubcommand((sc) =>
      sc
        .setName("purge-range")
        .setDescription("Supprime tous les messages entre deux IDs (inclus)")
        .addStringOption((o) =>
          o.setName("de").setDescription("ID du premier message").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("a").setDescription("ID du dernier message").setRequired(true),
        ),
    )
    .toJSON(),
];

const ADMIN_SUBS = ["dm", "backup", "guild-config"];
const EXTRA_SUBS = ["api-status", "bot-health", "healthz"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();

  if (ADMIN_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleAdmin(interaction);
  } else if (action === "maintenance") {
    Object.defineProperty(interaction, "commandName", { value: "maintenance", writable: true });
    await handleMaintenance(interaction);
  } else if (action === "clean-duplicates") {
    Object.defineProperty(interaction, "commandName", {
      value: "clean-duplicates",
      writable: true,
    });
    await handleCleanDuplicates(interaction);
  } else if (action === "channel-routing") {
    Object.defineProperty(interaction, "commandName", { value: "channel-routing", writable: true });
    await handleChannelRouting(interaction);
  } else if (action === "purge-content") {
    Object.defineProperty(interaction, "commandName", { value: "purge-content", writable: true });
    await handlePurgeContent(interaction);
  } else if (action === "purge-range") {
    Object.defineProperty(interaction, "commandName", { value: "purge-range", writable: true });
    await handlePurgeRange(interaction);
  } else if (EXTRA_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleExtraCmd(interaction, dc);
  } else {
    await handleAdminExtra(interaction, dc);
  }
}
