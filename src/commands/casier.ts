import logger from "../utils/logger.js";
import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import prisma from "../prisma.js";
import { requireMod, requireAdmin } from "../services/permissions.js";
import {
  type CasierItem,
  casierAccentColor,
  loadCasier,
  paginateCasierTable,
  summarizeCasierTypes,
} from "../services/casierQuery.js";

const FOOTER = { text: "Système de Surveillance • v1.1.0" };
const CONTENT_LIMIT = 1900;

export function buildCasierSlashPages(opts: {
  username: string;
  userId: string;
  items: CasierItem[];
  riskScore: number;
  riskLevel: string;
  underWatch: boolean;
}): string[] {
  const count = opts.items.length;
  const countBit = `${count} entrée${count > 1 ? "s" : ""}`;
  const types = summarizeCasierTypes(opts.items);
  const watch = opts.underWatch ? "Surveillance **oui**" : "Surveillance non";
  const intro = [
    `**Casier judiciaire** · ${opts.username}`,
    `<@${opts.userId}>`,
    `**${countBit}**${types ? ` · ${types}` : ""}`,
    `Risque **${opts.riskScore}** (${opts.riskLevel}) · ${watch}`,
    "",
  ].join("\n");

  const tables = paginateCasierTable(
    opts.items,
    false,
    Math.max(400, CONTENT_LIMIT - intro.length - 32),
  );
  return tables.map((table, index) => {
    const pageBit = tables.length > 1 ? `\n\n*Page ${index + 1} / ${tables.length}*` : "";
    return `${intro}${table}${pageBit}`;
  });
}

export const commands = [
  new SlashCommandBuilder()
    .setName("casier")
    .setDescription("Affiche le casier judiciaire d'un membre")
    .addUserOption((option) =>
      option.setName("cible").setDescription("Le membre à consulter").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("casier-clear")
    .setDescription("Supprime une sanction ou tout le casier (admin)")
    .addIntegerOption((option) =>
      option.setName("id").setDescription("ID de la sanction").setRequired(false),
    )
    .addUserOption((option) =>
      option.setName("membre").setDescription("Membre à effacer").setRequired(false),
    )
    .toJSON(),
];

export function buildNavRow(page: number, total: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("casier_prev")
      .setLabel("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("casier_page")
      .setLabel("Page " + (page + 1) + " / " + total)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("casier_next")
      .setLabel("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === total - 1),
  );
}

export async function handleCasierClear(interaction: ChatInputCommandInteraction) {
  const sanctionId = interaction.options.getInteger("id");
  const membre = interaction.options.getUser("membre");
  if (!sanctionId && !membre) {
    await interaction.reply({
      content: "❌ Fournis un ID de sanction OU un membre.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  if (sanctionId) {
    const s = await prisma.sanction.findUnique({ where: { id: sanctionId } });
    if (!s) {
      await interaction.reply({
        content: "❌ Sanction introuvable.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    await prisma.sanction.delete({ where: { id: sanctionId } });
    await interaction.reply({
      content: "✅ Sanction #" + sanctionId + " (" + s.type + ") supprimée.",
      flags: [MessageFlags.Ephemeral],
    });
  } else if (membre) {
    const d = await prisma.sanction.deleteMany({
      where: { userId: membre.id, guildId: interaction.guildId! },
    });
    await interaction.reply({
      content: "✅ " + d.count + " sanction(s) supprimée(s) pour " + membre.tag + ".",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName === "casier-clear") {
    if (!(await requireAdmin(interaction))) return;
    await handleCasierClear(interaction);
    return;
  }

  if (!(await requireMod(interaction))) return;

  const cible = interaction.options.getUser("cible", true);
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "❌ Commande utilisable seulement sur un serveur.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  try {
    logger.info("🔍 [Casier] Recherche sanctions pour ID:", cible.id, "| Tag:", cible.tag);

    const snapshot = await loadCasier(guildId, cible.id, 50);
    logger.info("📊 [Casier] Total sanctions:", snapshot.items.length);

    const thumbnail =
      typeof cible.displayAvatarURL === "function"
        ? cible.displayAvatarURL({ size: 128 })
        : undefined;

    const chrome = () => {
      const embed = new EmbedBuilder()
        .setTitle("Casier judiciaire · " + cible.username)
        .setColor(snapshot.items.length === 0 ? 0x2ecc71 : casierAccentColor(snapshot.items))
        .setFooter(FOOTER)
        .setTimestamp();
      if (thumbnail) embed.setThumbnail(thumbnail);
      return embed;
    };

    if (snapshot.items.length === 0) {
      const embed = chrome()
        .setDescription(
          `**Casier vierge.**\nAucune sanction ni log (ban, timeout, kick, mute, warn).`,
        )
        .addFields(
          { name: "Membre", value: cible.tag, inline: true },
          { name: "ID", value: cible.id, inline: true },
          {
            name: "Risque",
            value: `${snapshot.riskScore} · ${snapshot.riskLevel}`,
            inline: true,
          },
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const pages = buildCasierSlashPages({
      username: cible.username,
      userId: cible.id,
      items: snapshot.items,
      riskScore: snapshot.riskScore,
      riskLevel: snapshot.riskLevel,
      underWatch: snapshot.underWatch,
    });
    const card = chrome().addFields(
      { name: "Membre", value: cible.tag, inline: true },
      { name: "ID", value: cible.id, inline: true },
      { name: "Total", value: String(snapshot.items.length), inline: true },
    );

    if (pages.length === 1) {
      await interaction.editReply({ content: pages[0], embeds: [card] });
      return;
    }

    let page = 0;
    const reply = await interaction.editReply({
      content: pages[0],
      embeds: [card],
      components: [buildNavRow(0, pages.length)],
    });
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({
          content: "❌ Seul l'auteur peut naviguer.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      page =
        btn.customId === "casier_prev"
          ? Math.max(0, page - 1)
          : Math.min(pages.length - 1, page + 1);
      await btn.update({
        content: pages[page],
        embeds: [card],
        components: [buildNavRow(page, pages.length)],
      });
    });

    collector.on("end", async () => {
      const row = buildNavRow(page, pages.length);
      row.components.forEach((b) => b.setDisabled(true));
      await reply.edit({ components: [row] }).catch((err) => {
        logger.error("[Casier] Erreur edit reply:", String(err));
      });
    });
  } catch (error) {
    logger.error("[CRASH CASIER]", error);
    try {
      await interaction.editReply({
        content: "❌ Erreur interne. L'erreur a été logguée dans la console.",
      });
    } catch {
      await interaction.followUp({
        content: "❌ Erreur interne.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
}
