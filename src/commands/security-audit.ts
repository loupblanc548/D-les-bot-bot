import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import logger from "../utils/logger.js";
import { prisma } from "../prisma.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("security-audit")
    .setDescription("Audit s\u00e9curit\u00e9 : r\u00e9partition des sanctions sur les derni\u00e8res 24h")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

const SANCTION_TYPE_LABELS: Record<string, string> = {
  WARN: "\u26a0\ufe0f Avertissement",
  MUTE: "\ud83d\udd07 Mute",
  TIMEOUT: "\u23f1\ufe0f Timeout",
  KICK: "\ud83d\udc62 Kick",
  BAN: "\ud83d\udd28 Ban",
  TEMPBAN: "\u23f1\ufe0f Ban temporaire",
  UNBAN: "\ud83d\udd13 D\u00e9ban",
};

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("\u274c Cette commande doit \u00eatre ex\u00e9cut\u00e9e dans un serveur."),
      ],
      ephemeral: true,
    });
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let rows: Array<{ type: string; _count: { _all: number } }>;
  try {
    // @ts-expect-error - Prisma groupBy type issue
    rows = await prisma.sanction.groupBy({
      by: ["type"],
      where: { guildId, createdAt: { gte: since } },
      _count: { _all: true },
    });
  } catch (error) {
    logger.error("event", { cmd: "security-audit", err: error instanceof Error ? error.message : error },
      "Failed to query sanctions",
    );
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("\u274c Erreur lors de la lecture des sanctions."),
      ],
      ephemeral: true,
    });
    return;
  }

  const total = rows.reduce((acc, r) => acc + r._count._all, 0);
  const sorted = [...rows].sort((a, b) => b._count._all - a._count._all);

  const embed = new EmbedBuilder()
    .setTitle("\ud83d\udee1\ufe0f Audit s\u00e9curit\u00e9 \u2014 derni\u00e8res 24h")
    .setColor(total === 0 ? 0x95a5a6 : 0xf79f3a)
    .setDescription(
      total === 0
        ? "Aucune sanction enregistr\u00e9e sur cette p\u00e9riode."
        : `**${total}** sanction(s) au total.`,
    )
    .setTimestamp(new Date());

  for (const r of sorted) {
    const label = SANCTION_TYPE_LABELS[r.type] ?? r.type;
    embed.addFields({ name: label, value: `${r._count._all}`, inline: true });
  }

  logger.info("event", { cmd: "security-audit", user: interaction.user.id, guildId, total },
    "/security-audit invoked",
  );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
