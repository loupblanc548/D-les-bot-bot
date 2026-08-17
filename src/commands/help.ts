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
} from "discord.js";

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

const COMMAND_CATEGORIES: Record<string, CommandInfo[]> = {
  "🤖 IA": [
    { name: "/ai chat", description: "Discuter avec l'IA", category: "IA" },
    { name: "/ai image", description: "Générer une image", category: "IA" },
  ],
  "🛡️ Modération": [
    { name: "/mod warn", description: "Avertir un membre", category: "Modération" },
    { name: "/mod mute", description: "Mute un membre", category: "Modération" },
    { name: "/mod kick", description: "Expulser un membre", category: "Modération" },
    { name: "/mod ban", description: "Bannir un membre", category: "Modération" },
  ],
  "🎮 Gaming": [
    { name: "/game deals", description: "Voir les jeux gratuits", category: "Gaming" },
    { name: "/game news", description: "Actus gaming", category: "Gaming" },
  ],
  "🔧 Utilitaires": [
    { name: "/help", description: "Cette commande", category: "Utilitaires" },
    { name: "/stats", description: "Statistiques du bot", category: "Utilitaires" },
    { name: "/health", description: "Health check", category: "Utilitaires" },
    { name: "/remind", description: "Créer un rappel", category: "Utilitaires" },
  ],
};

const COMMANDS_PER_PAGE = 8;
const TIMEOUT = 120_000;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const categoryFilter = interaction.options.getString("categorie");

  let commands: CommandInfo[] = [];
  let categories: string[];

  if (categoryFilter) {
    const cat = Object.keys(COMMAND_CATEGORIES).find((k) =>
      k.toLowerCase().includes(categoryFilter.toLowerCase()),
    );
    if (cat) {
      commands = COMMAND_CATEGORIES[cat];
    } else {
      await interaction.reply({ content: "❌ Catégorie introuvable", ephemeral: true });
      return;
    }
  } else {
    categories = Object.keys(COMMAND_CATEGORIES);
    for (const cat of categories) {
      commands.push(...COMMAND_CATEGORIES[cat]);
    }
  }

  const pages = buildPages(commands);
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
    } catch {
      // ignore
    }
  });
}
