import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import logger from "../utils/logger.js";
import { prisma } from "../prisma.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Affiche les informations enregistr\u00e9es sur un utilisateur")
    .addUserOption((option) =>
      option
        .setName("utilisateur")
        .setDescription("Utilisateur \u00e0 inspecter (par d\u00e9faut: toi-m\u00eame)")
        .setRequired(false),
    )
    .toJSON(),
];

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getUser("utilisateur") ?? interaction.user;
  const embed = new EmbedBuilder().setColor("#b1b12a").setTimestamp(new Date());

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: target.id } });
    const guildId = interaction.guildId;
    const sanctionsCount = guildId
      ? await prisma.sanction.count({ where: { userId: target.id, guildId } })
      : null;

    if (!dbUser) {
      embed
        .setTitle(`\ud83d\udc64 ${target.tag}`)
        .setDescription(
          "Cet utilisateur n\u2019a **pas encore \u00e9t\u00e9 enregistr\u00e9** en base de donn\u00e9es.",
        )
        .addFields(
          { name: "\ud83c\udd94 ID Discord", value: target.id, inline: true },
          {
            name: "\ud83d\udcc5 Compte cr\u00e9\u00e9 le",
            value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
        );
    } else {
      const joinedAt = dbUser.joinedAt ?? null;
      embed
        .setTitle(`\ud83d\udc64 ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: "\ud83c\udd94 ID Discord", value: target.id, inline: true },
          {
            name: "\ud83d\udcc5 Compte cr\u00e9\u00e9 le",
            value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          ...(joinedAt
            ? ([
                {
                  name: "\ud83d\udcbe Premi\u00e8re vue par le bot",
                  value: `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`,
                  inline: true,
                },
              ] as const)
            : []),
          {
            name: "\u2696\ufe0f Sanctions (ce serveur)",
            value: sanctionsCount === null ? "N/A en DM" : `${sanctionsCount}`,
            inline: true,
          },
        );
    }
  } catch (error) {
    logger.error(
      {
        cmd: "userinfo",
        err: error instanceof Error ? error.message : error,
        target: target.id,
      },
      "Failed to look up user",
    );
    embed
      .setTitle(`\ud83d\udc64 ${target.tag}`)
      .setDescription("\u26a0\ufe0f Erreur lors de la lecture de la base de donn\u00e9es.");
  }

  logger.info(
    { cmd: "userinfo", user: interaction.user.id, target: target.id },
    "/userinfo invoked",
  );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
