import logger from "../utils/logger.js";
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
  ChannelType,
} from "discord.js";
import prisma from "../prisma.js";
import {
  addSocialFollow,
  removeSocialFollow,
  listSocialFollows,
} from "../services/socialFollow.js";

const FOOTER = { text: "Social Follow System" };

export const commands = [
  new SlashCommandBuilder()
    .setName("follow")
    .setDescription("Suit une chaîne ou un compte sur n'importe quelle plateforme sociale")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Ajoute une chaîne à suivre")
        .addStringOption((o) =>
          o
            .setName("plateforme")
            .setDescription("Plateforme sociale")
            .setRequired(true)
            .addChoices(
              { name: "🟣 Twitch", value: "twitch" },
              { name: "🔴 YouTube", value: "youtube" },
              { name: "🔵 Twitter / X", value: "twitter" },
              { name: "📸 Instagram", value: "instagram" },
              { name: "🎵 TikTok", value: "tiktok" },
              { name: "👍 Facebook", value: "facebook" },
              { name: "🤖 Reddit", value: "reddit" },
              { name: "☁️ Bluesky", value: "bluesky" },
              { name: "🐘 Mastodon", value: "mastodon" },
              { name: "🟢 Kick", value: "kick" },
              { name: "✈️ Telegram", value: "telegram" },
              { name: "👻 Snapchat", value: "snapchat" },
              { name: "💼 LinkedIn", value: "linkedin" },
              { name: "📌 Pinterest", value: "pinterest" },
              { name: "🎥 Dailymotion", value: "dailymotion" },
              { name: "🎬 Vimeo", value: "vimeo" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("nom")
            .setDescription("Nom de la chaîne ou du compte (ex: shroud, MrBeast, elonmusk)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Liste les chaînes suivies"))
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Retire une chaîne du suivi")
        .addStringOption((o) =>
          o
            .setName("plateforme")
            .setDescription("Plateforme sociale")
            .setRequired(true)
            .addChoices(
              { name: "🟣 Twitch", value: "twitch" },
              { name: "🔴 YouTube", value: "youtube" },
              { name: "🔵 Twitter / X", value: "twitter" },
              { name: "📸 Instagram", value: "instagram" },
              { name: "🎵 TikTok", value: "tiktok" },
              { name: "👍 Facebook", value: "facebook" },
              { name: "🤖 Reddit", value: "reddit" },
              { name: "☁️ Bluesky", value: "bluesky" },
              { name: "🐘 Mastodon", value: "mastodon" },
              { name: "🟢 Kick", value: "kick" },
              { name: "✈️ Telegram", value: "telegram" },
              { name: "👻 Snapchat", value: "snapchat" },
              { name: "💼 LinkedIn", value: "linkedin" },
              { name: "📌 Pinterest", value: "pinterest" },
              { name: "🎥 Dailymotion", value: "dailymotion" },
              { name: "🎬 Vimeo", value: "vimeo" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("nom")
            .setDescription("Nom de la chaîne")
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
    const follows = await prisma.socialFollow.findMany({
      where: { guildId: interaction.guildId! },
      select: { platform: true, channelName: true },
      take: 25,
    });
    const filtered = follows
      .filter((f) => f.channelName.toLowerCase().includes(query))
      .slice(0, 25)
      .map((f) => ({ name: `${f.platform}/${f.channelName}`, value: f.channelName }));
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
    logger.error("[Follow] Erreur:", err);
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
  const platform = interaction.options.getString("plateforme", true);
  const channelName = interaction.options.getString("nom", true);
  const guildId = interaction.guildId!;

  // Check if already followed
  const existing = await prisma.socialFollow.findFirst({
    where: { guildId, platform, channelName: { equals: channelName, mode: "insensitive" } },
  });

  if (existing) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffaa00)
          .setDescription(`**${channelName}** sur ${platform} est déjà suivi.`),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Ask user: DM or channel?
  const dmButton = new ButtonBuilder()
    .setCustomId("follow_dm")
    .setLabel("📩 MP (Message Privé)")
    .setStyle(ButtonStyle.Primary);

  const channelButton = new ButtonBuilder()
    .setCustomId("follow_channel")
    .setLabel("📢 Salon spécifique")
    .setStyle(ButtonStyle.Secondary);

  const cancelButton = new ButtonBuilder()
    .setCustomId("follow_cancel")
    .setLabel("❌ Annuler")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    dmButton,
    channelButton,
    cancelButton,
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Suivre ${channelName} sur ${platform}`)
    .setDescription(
      `**Où veux-tu recevoir les notifications ?**\n\n` +
        `📩 **MP** — Notifications en message privé\n` +
        `📢 **Salon** — Notifications dans un salon Discord spécifique`,
    )
    .setFooter(FOOTER);

  await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });

  const reply = await interaction.fetchReply();

  try {
    const response = await reply
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60_000,
      })
      .catch(() => null);

    if (!response) {
      await interaction.editReply({
        embeds: [embed.setDescription("⏰ Temps écoulé.")],
        components: [],
      });
      return;
    }

    if (response.customId === "follow_cancel") {
      await response.update({
        embeds: [new EmbedBuilder().setColor(0xff3344).setDescription("❌ Suivi annulé.")],
        components: [],
      });
      return;
    }

    if (response.customId === "follow_dm") {
      const result = await addSocialFollow({
        guildId,
        platform: platform as
          | "twitch"
          | "youtube"
          | "twitter"
          | "instagram"
          | "tiktok"
          | "facebook"
          | "reddit"
          | "bluesky"
          | "mastodon"
          | "kick"
          | "telegram"
          | "snapchat"
          | "linkedin"
          | "pinterest"
          | "dailymotion"
          | "vimeo",
        channelName,
        notifyMode: "dm",
        notifyChannel: null,
        notifyUserId: interaction.user.id,
        addedBy: interaction.user.id,
      });

      await response.update({
        embeds: [
          new EmbedBuilder()
            .setColor(result.success ? 0x53fc18 : 0xff3344)
            .setDescription(result.message),
        ],
        components: [],
      });
      return;
    }

    if (response.customId === "follow_channel") {
      // Ask which channel
      const channelSelectRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("follow_here")
          .setLabel("📌 Salon actuel")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("follow_cancel")
          .setLabel("❌ Annuler")
          .setStyle(ButtonStyle.Danger),
      );

      await response.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`Choisir le salon pour ${channelName}`)
            .setDescription(
              `**Clique sur "Salon actuel" pour utiliser <#${interaction.channelId}>**\n` +
                `Ou tape le nom d'un salon dans ce serveur.`,
            )
            .setFooter(FOOTER),
        ],
        components: [channelSelectRow],
      });

      const channelResponse = await reply
        .awaitMessageComponent({
          componentType: ComponentType.Button,
          time: 60_000,
        })
        .catch(() => null);

      if (!channelResponse) {
        await interaction.editReply({
          embeds: [embed.setDescription("⏰ Temps écoulé.")],
          components: [],
        });
        return;
      }

      if (channelResponse.customId === "follow_cancel") {
        await channelResponse.update({
          embeds: [new EmbedBuilder().setColor(0xff3344).setDescription("❌ Suivi annulé.")],
          components: [],
        });
        return;
      }

      if (channelResponse.customId === "follow_here") {
        const result = await addSocialFollow({
          guildId,
          platform: platform as
            | "twitch"
            | "youtube"
            | "twitter"
            | "instagram"
            | "tiktok"
            | "facebook"
            | "reddit"
            | "bluesky"
            | "mastodon"
            | "kick"
            | "telegram"
            | "snapchat"
            | "linkedin"
            | "pinterest"
            | "dailymotion"
            | "vimeo",
          channelName,
          notifyMode: "channel",
          notifyChannel: interaction.channelId!,
          notifyUserId: null,
          addedBy: interaction.user.id,
        });

        await channelResponse.update({
          embeds: [
            new EmbedBuilder()
              .setColor(result.success ? 0x53fc18 : 0xff3344)
              .setDescription(result.message),
          ],
          components: [],
        });
      }
    }
  } catch {
    await interaction.editReply({ components: [] }).catch(() => {});
  }
}

async function handleList(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const follows = await listSocialFollows(guildId);

  if (follows.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2f3136)
          .setDescription("Aucune chaîne suivie. Ajoutez-en avec `/follow add`."),
      ],
    });
    return;
  }

  const platformEmoji: Record<string, string> = {
    twitch: "🟣",
    youtube: "🔴",
    twitter: "🔵",
  };

  const PER_PAGE = 10;
  const totalPages = Math.ceil(follows.length / PER_PAGE);
  let currentPage = 0;

  const buildEmbed = (page: number) => {
    const start = page * PER_PAGE;
    const pageItems = follows.slice(start, start + PER_PAGE);
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Chaînes suivies")
      .setDescription(
        pageItems
          .map((f) => {
            const emoji = platformEmoji[f.platform] || "📡";
            const status = f.isLive ? "🔴 LIVE" : "⚫ Offline";
            const dest = f.notifyMode === "dm" ? "📩 MP" : `📢 <#${f.notifyChannel}>`;
            return `${emoji} **${f.channelName}** (${f.platform})\n> ${status} → ${dest}`;
          })
          .join("\n\n"),
      )
      .setFooter({ text: `Page ${page + 1}/${totalPages} — ${follows.length} chaîne(s)` });
  };

  const buildButtons = (page: number) => {
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (page > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("follow_prev")
          .setLabel("◀️ Précédent")
          .setStyle(ButtonStyle.Secondary),
      );
    }
    if (page < totalPages - 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("follow_next")
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

  try {
    while (true) {
      const response = await reply
        .awaitMessageComponent({ componentType: ComponentType.Button, time: 60_000 })
        .catch(() => null);

      if (!response) {
        await interaction.editReply({ components: [] }).catch(() => {});
        break;
      }

      if (response.customId === "follow_prev" && currentPage > 0) currentPage--;
      else if (response.customId === "follow_next" && currentPage < totalPages - 1) currentPage++;

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
  const platform = interaction.options.getString("plateforme", true);
  const channelName = interaction.options.getString("nom", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const result = await removeSocialFollow(
    guildId,
    platform as
      | "twitch"
      | "youtube"
      | "twitter"
      | "instagram"
      | "tiktok"
      | "facebook"
      | "reddit"
      | "bluesky"
      | "mastodon"
      | "kick"
      | "telegram"
      | "snapchat"
      | "linkedin"
      | "pinterest"
      | "dailymotion"
      | "vimeo",
    channelName,
  );

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(result.success ? 0x53fc18 : 0xffaa00)
        .setDescription(result.message),
    ],
  });
}
