/**
 * help.ts — Commande /help dynamique avec pagination
 *
 * Génère la liste des commandes depuis le routeur et pagine avec boutons.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ApplicationCommand,
} from "discord.js";
import logger from "../utils/logger.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Affiche la liste des commandes disponibles")
  .addStringOption((opt) =>
    opt.setName("categorie").setDescription("Filtrer par catégorie").setRequired(false),
  );

interface CommandInfo {
  name: string;
  description: string;
  category: string;
}

const FALLBACK_COMMANDS: CommandInfo[] = [
  {
    name: "/help",
    description: "Affiche les commandes réellement enregistrées",
    category: "Utilitaires",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  ai: "🤖 IA",
  mod: "🛡️ Modération",
  security: "🔒 Sécurité",
  game: "🎮 Gaming",
  mc: "⛏️ Minecraft",
  admin: "👑 Administration",
  bot: "⚙️ Bot",
  sources: "📡 Surveillance",
  alert: "🚨 Alertes",
  casier: "📋 Casier",
  ticket: "🎫 Tickets",
  tools: "🔧 Outils",
  fun: "🎉 Fun",
  music: "🎵 Musique",
  community: "👥 Communauté",
};

const COMMANDS_PER_PAGE = 8;
const TIMEOUT = 120_000;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const categoryFilter = interaction.options.getString("categorie")?.trim().toLowerCase();
  const commands = await loadRegisteredCommands(interaction);
  const filtered = categoryFilter
    ? commands.filter((command) => command.category.toLowerCase().includes(categoryFilter))
    : commands;

  if (categoryFilter && filtered.length === 0) {
    await interaction.reply({ content: "❌ Catégorie introuvable", ephemeral: true });
    return;
  }

  const pages = buildPages(filtered);
  if (pages.length === 0) {
    await interaction.reply({ content: "Aucune commande disponible.", ephemeral: true });
    return;
  }

  if (pages.length === 1) {
    await interaction.reply({ embeds: [pages[0]] });
    return;
  }

  await sendPaginated(interaction, pages);
}

async function loadRegisteredCommands(
  interaction: ChatInputCommandInteraction,
): Promise<CommandInfo[]> {
  try {
    const registered = await interaction.client.application?.commands.fetch();
    if (!registered?.size) return FALLBACK_COMMANDS;

    const commands: CommandInfo[] = [];
    for (const command of registered.values()) {
      commands.push(...flattenCommand(command));
    }
    return commands.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return FALLBACK_COMMANDS;
  }
}

function flattenCommand(command: ApplicationCommand): CommandInfo[] {
  const category = CATEGORY_LABELS[command.name] ?? "🔧 Autres";
  const options = "options" in command ? command.options : [];
  const subcommands = options.filter((option) => option.type === 1 || option.type === 2);

  if (subcommands.length === 0) {
    return [{ name: `/${command.name}`, description: command.description, category }];
  }

  return subcommands.flatMap((subcommand) => {
    const nested = "options" in subcommand ? (subcommand.options ?? []) : [];
    const nestedCommands = nested.filter((option) => option.type === 1);
    if (nestedCommands.length === 0) {
      return [
        {
          name: `/${command.name} ${subcommand.name}`,
          description: subcommand.description,
          category,
        },
      ];
    }
    return nestedCommands.map((nestedCommand) => ({
      name: `/${command.name} ${subcommand.name} ${nestedCommand.name}`,
      description: nestedCommand.description,
      category,
    }));
  });
}

function buildPages(commands: CommandInfo[]): EmbedBuilder[] {
  const pages: EmbedBuilder[] = [];
  for (let i = 0; i < commands.length; i += COMMANDS_PER_PAGE) {
    const chunk = commands.slice(i, i + COMMANDS_PER_PAGE);
    const embed = new EmbedBuilder()
      .setTitle("📖 Aide — Commandes")
      .setColor(0x5865f2)
      .setDescription(chunk.map((c) => `**${c.name}** — ${c.description}`).join("\n"))
      .setFooter({
        text: `Page ${Math.floor(i / COMMANDS_PER_PAGE) + 1}/${Math.ceil(commands.length / COMMANDS_PER_PAGE)}`,
      });
    pages.push(embed);
  }
  return pages;
}

async function sendPaginated(
  interaction: ChatInputCommandInteraction,
  pages: EmbedBuilder[],
): Promise<void> {
  let currentPage = 0;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("help_prev")
      .setLabel("◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("help_next").setLabel("▶️").setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [pages[0]], components: [row] });
  const reply = await interaction.fetchReply();

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUT,
  });

  collector.on("collect", async (btnInteraction) => {
    if (btnInteraction.user.id !== interaction.user.id) {
      await btnInteraction.reply({ content: "Ces boutons ne sont pas pour toi!", ephemeral: true });
      return;
    }

    if (btnInteraction.customId === "help_next") {
      currentPage = Math.min(currentPage + 1, pages.length - 1);
    } else if (btnInteraction.customId === "help_prev") {
      currentPage = Math.max(currentPage - 1, 0);
    }

    row.components[0].setDisabled(currentPage === 0);
    row.components[1].setDisabled(currentPage === pages.length - 1);

    await btnInteraction.update({ embeds: [pages[currentPage]], components: [row] });
  });

  collector.on("end", async () => {
    row.components.forEach((c) => c.setDisabled(true));
    try {
      await interaction.editReply({ components: [row] });
    } catch { logger.error("[Silent catch]"); }
  });
}
