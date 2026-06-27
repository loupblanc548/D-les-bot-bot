import logger from "../utils/logger.js";
// Commandes Twitch — /twitch add|list|remove
import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} from "discord.js";
import prisma from "../prisma.js";

const FOOTER = { text: "Surveillance System • Twitch" };

export const commands = [
  new SlashCommandBuilder()
    .setName("twitch")
    .setDescription("Gere les notifications de streamers Twitch")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Ajoute un streamer a surveiller")
        .addStringOption((o) =>
          o
            .setName("streamer")
            .setDescription("Nom du streamer Twitch")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon ou envoyer les notifications (defaut: salon Twitch configure)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Liste les streamers surveilles"))
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Retire un streamer de la surveillance")
        .addStringOption((o) =>
          o
            .setName("streamer")
            .setDescription("Nom du streamer")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),
];

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const query = interaction.options.getFocused().toLowerCase();

  if (sub === "remove") {
    // Suggérer les streamers déjà suivis sur ce serveur
    const follows = await prisma.twitchFollow.findMany({
      where: { guildId: interaction.guildId! },
      select: { streamerName: true },
      take: 25,
    });
    const filtered = follows
      .filter((f) => f.streamerName.toLowerCase().includes(query))
      .slice(0, 25)
      .map((f) => ({ name: f.streamerName, value: f.streamerName }));
    await interaction.respond(filtered);
    return;
  }

  if (sub === "add") {
    // Suggérer quelques streamers populaires + ce que l'utilisateur tape
    const popular = [
      "shroud",
      "summit1g",
      "xqc",
      "sodapoppin",
      "lirik",
      "timthetatman",
      "ninja",
      "pokimane",
      "asmongold",
      "esl_csgo",
    ];
    const filtered = popular
      .filter((s) => s.includes(query))
      .slice(0, 25)
      .map((s) => ({ name: s, value: s }));
    await interaction.respond(filtered);
    return;
  }

  await interaction.respond([]);
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  try {
    switch (sub) {
      case "add":
        await handleAdd(interaction);
        break;
      case "list":
        await handleList(interaction);
        break;
      case "remove":
        await handleRemove(interaction);
        break;
    }
  } catch (err) {
    logger.error("[Twitch] Erreur:", err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff3344)
      .setDescription("Une erreur est survenue.");
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
      }
    } catch {
      /* ignore */
    }
  }
}

async function handleAdd(interaction: ChatInputCommandInteraction) {
  const streamerName = interaction.options.getString("streamer", true);
  const channel = interaction.options.getChannel("salon") || interaction.channel;
  const channelId = channel?.id || interaction.channelId;
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Vérifier si déjà suivi
  const exists = await prisma.twitchFollow.findFirst({
    where: { guildId, streamerName: { equals: streamerName, mode: "insensitive" } },
  });

  if (exists) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffaa00)
          .setDescription(`**${streamerName}** est deja surveille.`),
      ],
    });
    return;
  }

  try {
    // Tenter de récupérer l'ID Twitch du streamer (nécessite le service Twitch)
    const { getStreamerByLogin } = await import("../services/twitch.js");
    const streamer = await getStreamerByLogin(streamerName);

    await prisma.twitchFollow.create({
      data: {
        guildId,
        channelId: channelId!,
        streamerName: streamerName.toLowerCase(),
        streamerId: streamer?.id || streamerName.toLowerCase(),
        isLive: false,
        addedBy: interaction.user.id,
      },
    });

    const embed = new EmbedBuilder()
      .setColor(0x9146ff)
      .setTitle("Streamer ajoute")
      .setDescription(
        `**${streamerName}** est maintenant surveille.\n` +
          `Les notifications seront envoyees dans <#${channelId}>.`,
      )
      .setFooter(FOOTER);

    await interaction.editReply({ embeds: [embed] });
  } catch {
    // Fallback sans vérification API
    await prisma.twitchFollow.create({
      data: {
        guildId,
        channelId: channelId!,
        streamerName: streamerName.toLowerCase(),
        streamerId: streamerName.toLowerCase(),
        isLive: false,
        addedBy: interaction.user.id,
      },
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9146ff)
          .setTitle("Streamer ajoute (mode degrade)")
          .setDescription(
            `**${streamerName}** est maintenant surveille.\n` +
              `⚠️ Verification Twitch API indisponible — le streamer sera surveille par nom.`,
          )
          .setFooter(FOOTER),
      ],
    });
  }
}

async function handleList(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const follows = await prisma.twitchFollow.findMany({
    where: { guildId },
    orderBy: { addedAt: "desc" },
  });

  if (follows.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2f3136)
          .setDescription("Aucun streamer surveille. Ajoutez-en avec `/twitch add`."),
      ],
    });
    return;
  }

  const PER_PAGE = 10;
  const totalPages = Math.ceil(follows.length / PER_PAGE);
  let currentPage = 0;

  const buildEmbed = (page: number) => {
    const start = page * PER_PAGE;
    const pageItems = follows.slice(start, start + PER_PAGE);
    return new EmbedBuilder()
      .setColor(0x9146ff)
      .setTitle("Streamers surveilles")
      .setDescription(
        pageItems
          .map(
            (f) =>
              `**${f.streamerName}** ${f.isLive ? "🔴 LIVE" : "⚫ Offline"}\n` +
              `> Salon : <#${f.channelId}> | Ajoute par <@${f.addedBy}>`,
          )
          .join("\n\n"),
      )
      .setFooter({ text: `Page ${page + 1}/${totalPages} — ${follows.length} streamer(s)` });
  };

  const buildButtons = (page: number) => {
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (page > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("twitch_prev")
          .setLabel("◀️ Précédent")
          .setStyle(ButtonStyle.Secondary),
      );
    }
    if (page < totalPages - 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("twitch_next")
          .setLabel("Suivant ▶️")
          .setStyle(ButtonStyle.Primary),
      );
    }
    return row.components.length > 0 ? [row] : [];
  };

  const reply = await interaction.editReply({
    embeds: [buildEmbed(currentPage)],
    components: buildButtons(currentPage),
  });

  // Écouter les boutons pendant 60 secondes
  try {
    while (true) {
      const response = await reply
        .awaitMessageComponent({
          componentType: ComponentType.Button,
          time: 60_000,
        })
        .catch(() => null);

      if (!response) {
        await interaction.editReply({ components: [] }).catch(() => {});
        break;
      }

      if (response.customId === "twitch_prev" && currentPage > 0) {
        currentPage--;
      } else if (response.customId === "twitch_next" && currentPage < totalPages - 1) {
        currentPage++;
      }

      await response.update({
        embeds: [buildEmbed(currentPage)],
        components: buildButtons(currentPage),
      });
    }
  } catch {
    await interaction.editReply({ components: [] }).catch(() => {});
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction) {
  const streamerName = interaction.options.getString("streamer", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const result = await prisma.twitchFollow.deleteMany({
    where: { guildId, streamerName: { equals: streamerName, mode: "insensitive" } },
  });

  if (result.count === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffaa00)
          .setDescription(`**${streamerName}** n'est pas dans la liste de surveillance.`),
      ],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x53fc18)
        .setDescription(`**${streamerName}** retire de la surveillance.`),
    ],
  });
}
