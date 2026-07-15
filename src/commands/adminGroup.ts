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
import { ingestUrl, searchKnowledge } from "../services/webIngestion.js";
import { EmbedBuilder } from "discord.js";

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
    .addSubcommand((sc) =>
      sc
        .setName("learn-url")
        .setDescription("Ingère une URL dans la base de connaissances du bot")
        .addStringOption((o) => o.setName("url").setDescription("URL à ingérer").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("prompt")
            .setDescription("Prompt personnalisé pour le résumé (optionnel)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("search-knowledge")
        .setDescription("Recherche dans la base de connaissances du bot")
        .addStringOption((o) =>
          o.setName("query").setDescription("Requête de recherche").setRequired(true),
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
  } else if (action === "learn-url") {
    await handleLearnUrl(interaction);
  } else if (action === "search-knowledge") {
    await handleSearchKnowledge(interaction);
  } else if (EXTRA_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleExtraCmd(interaction, dc);
  } else {
    await handleAdminExtra(interaction, dc);
  }
}

async function handleLearnUrl(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString("url", true);
  const customPrompt = interaction.options.getString("prompt") || undefined;

  if (!url.startsWith("http")) {
    await interaction.reply({
      content: "❌ URL invalide (doit commencer par http)",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await ingestUrl(url, { summarize: true, customPrompt });

  if (!result) {
    await interaction.editReply(`❌ Impossible d'ingérer ${url}`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📚 URL ingérée")
    .addFields(
      { name: "Titre", value: result.title.slice(0, 200), inline: false },
      { name: "Mots", value: String(result.wordCount), inline: true },
      { name: "Résumé", value: result.summary.slice(0, 1024), inline: false },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Stocké dans la base de connaissances" });

  await interaction.editReply({ embeds: [embed] });
}

async function handleSearchKnowledge(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true);

  await interaction.deferReply({ ephemeral: true });
  const results = await searchKnowledge(query, 5);

  if (!results.length) {
    await interaction.editReply("❌ Aucun contenu trouvé dans la base de connaissances.");
    return;
  }

  const embed = new EmbedBuilder().setTitle("🔍 Base de connaissances").setColor(0x5865f2);

  results.forEach((r, i) => {
    embed.addFields({
      name: `${i + 1}. ${r.title.slice(0, 100)}`,
      value: `${r.summary.slice(0, 200)}...\n[${r.url}](${r.url})`,
      inline: false,
    });
  });

  await interaction.editReply({ embeds: [embed] });
}
