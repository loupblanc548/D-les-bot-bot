/**
 * ticketGroup.ts — Commandes du système de tickets
 */
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Client,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  TextChannel,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import {
  createPanel,
  listPanels,
  deletePanel,
  closeTicket,
  addUserToTicket,
  listOpenTickets,
  getTicketTranscript,
} from "../services/ticketService.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Système de tickets de support")
    .addSubcommand((sc) =>
      sc
        .setName("setup")
        .setDescription("Crée un panneau de tickets (admin)")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon où afficher le panneau")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("titre").setDescription("Titre du panneau").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Description du panneau").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("bouton").setDescription("Texte du bouton").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("emoji").setDescription("Emoji du bouton").setRequired(false),
        )
        .addChannelOption((o) =>
          o
            .setName("categorie")
            .setDescription("Catégorie où créer les tickets")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        )
        .addRoleOption((o) =>
          o.setName("staff").setDescription("Rôle staff qui voit les tickets").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("bienvenue").setDescription("Message de bienvenue").setRequired(false),
        ),
    )
    .addSubcommand((sc) => sc.setName("list").setDescription("Liste des tickets ouverts"))
    .addSubcommand((sc) => sc.setName("panels").setDescription("Liste des panneaux configurés"))
    .addSubcommand((sc) =>
      sc
        .setName("close")
        .setDescription("Ferme le ticket actuel (utilisable dans un ticket)")
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison de fermeture").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Ajoute un utilisateur au ticket actuel")
        .addUserOption((o) =>
          o.setName("utilisateur").setDescription("L'utilisateur à ajouter").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("transcript")
        .setDescription("Récupère le transcript d'un ticket fermé")
        .addStringOption((o) =>
          o.setName("ticket_id").setDescription("ID du ticket").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("panel-delete")
        .setDescription("Supprime un panneau de tickets (admin)")
        .addStringOption((o) =>
          o.setName("panel_id").setDescription("ID du panneau").setRequired(true),
        ),
    )
    .toJSON(),
];

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();

  switch (action) {
    case "setup":
      await handleSetup(interaction);
      break;
    case "list":
      await handleList(interaction);
      break;
    case "panels":
      await handlePanels(interaction);
      break;
    case "close":
      await handleClose(interaction);
      break;
    case "add":
      await handleAdd(interaction);
      break;
    case "transcript":
      await handleTranscript(interaction);
      break;
    case "panel-delete":
      await handlePanelDelete(interaction);
      break;
    default:
      await interaction.reply({ content: "❌ Commande inconnue.", ephemeral: true });
  }
}

async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "❌ Serveur uniquement.", ephemeral: true });
    return;
  }

  const member = interaction.member;
  if (
    !(member as { permissions?: { has: (p: bigint) => boolean } }).permissions?.has(
      PermissionFlagsBits.ManageGuild,
    )
  ) {
    await interaction.reply({
      content: "❌ Tu dois avoir la permission `Gérer le serveur`.",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel("salon", true) as TextChannel;
  const title = interaction.options.getString("titre") || "🎫 Support - Tickets";
  const description =
    interaction.options.getString("description") ||
    "Besoin d'aide ? Clique sur le bouton ci-dessous pour créer un ticket.";
  const buttonLabel = interaction.options.getString("bouton") || "Créer un ticket";
  const buttonEmoji = interaction.options.getString("emoji") || "🎫";
  const category = interaction.options.getChannel("categorie");
  const staffRole = interaction.options.getRole("staff");
  const welcomeMsg =
    interaction.options.getString("bienvenue") ||
    "Bienvenue ! Décris ton problème, le staff va te répondre rapidement.";

  const embed = new EmbedBuilder()
    .setColor(0x00f0ff)
    .setTitle(title)
    .setDescription(description)
    .addFields({
      name: "📋 Règles",
      value:
        "- Sois précis dans ta demande\n- Ne crée qu'un seul ticket à la fois\n- Reste courtois avec le staff",
    })
    .setFooter({ text: interaction.guild.name });

  const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_create")
      .setLabel(buttonLabel)
      .setEmoji(buttonEmoji)
      .setStyle(ButtonStyle.Primary),
  );

  const sentMsg = await channel.send({ embeds: [embed], components: [button] });

  await createPanel({
    guildId: interaction.guildId,
    channelId: channel.id,
    messageId: sentMsg.id,
    title,
    description,
    buttonLabel,
    buttonEmoji,
    categoryId: category?.id ?? null,
    staffRoleId: staffRole?.id ?? null,
    welcomeMsg,
  });

  await interaction.reply({
    content: `✅ Panneau de tickets créé dans ${channel.toString()} !`,
    ephemeral: true,
  });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Serveur uniquement.", ephemeral: true });
    return;
  }

  const tickets = await listOpenTickets(interaction.guildId);
  if (tickets.length === 0) {
    await interaction.reply({ content: "📭 Aucun ticket ouvert.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎫 Tickets ouverts")
    .setColor(0x00f0ff)
    .setDescription(`${tickets.length} ticket(s) ouvert(s)`);

  for (const ticket of tickets.slice(0, 25)) {
    const claimed = ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Non pris en charge";
    embed.addFields({
      name: `#${ticket.channelId.slice(-8)}`,
      value: `**User:** <@${ticket.userId}>\n**Claim:** ${claimed}\n**Créé:** <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>${ticket.topic ? `\n**Sujet:** ${ticket.topic}` : ""}`,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePanels(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Serveur uniquement.", ephemeral: true });
    return;
  }

  const panels = await listPanels(interaction.guildId);
  if (panels.length === 0) {
    await interaction.reply({
      content: "📭 Aucun panneau configuré. Utilise `/ticket setup`.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎫 Panneaux de tickets")
    .setColor(0x00f0ff)
    .setDescription(`${panels.length} panneau(x) configuré(s)`);

  for (const panel of panels.slice(0, 25)) {
    embed.addFields({
      name: `\`${panel.id.slice(-8)}\` — ${panel.title}`,
      value: `**Salon:** <#${panel.channelId}>\n**Bouton:** ${panel.buttonEmoji} ${panel.buttonLabel}${panel.staffRoleId ? `\n**Staff:** <@&${panel.staffRoleId}>` : ""}`,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleClose(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel;
  if (!channel || !channel.name.startsWith("ticket-")) {
    await interaction.reply({
      content: "❌ Cette commande doit être utilisée dans un ticket.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  // Simuler une ButtonInteraction pour réutiliser closeTicket
  const fakeInteraction = {
    channel,
    user: interaction.user,
    reply: async (opts: { content: string; flags?: unknown[] }) => {
      await interaction.editReply(opts.content);
    },
  } as unknown as import("discord.js").ButtonInteraction;

  const closed = await closeTicket(fakeInteraction, interaction.user.id);
  if (!closed) {
    await interaction.editReply("❌ Impossible de fermer ce ticket.");
  }
}

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel;
  if (!channel || !channel.name.startsWith("ticket-")) {
    await interaction.reply({
      content: "❌ Cette commande doit être utilisée dans un ticket.",
      ephemeral: true,
    });
    return;
  }

  const user = interaction.options.getUser("utilisateur", true);
  const added = await addUserToTicket(channel, user.id);

  await interaction.reply({
    content: added
      ? `✅ ${user.toString()} ajouté au ticket.`
      : "❌ Impossible d'ajouter l'utilisateur.",
    ephemeral: true,
  });
}

async function handleTranscript(interaction: ChatInputCommandInteraction): Promise<void> {
  const ticketId = interaction.options.getString("ticket_id", true);
  const transcript = await getTicketTranscript(ticketId);

  if (!transcript) {
    await interaction.reply({
      content: "❌ Ticket introuvable ou aucun transcript.",
      ephemeral: true,
    });
    return;
  }

  if (transcript.length <= 1900) {
    await interaction.reply({
      content: `📋 **Transcript du ticket \`${ticketId.slice(-8)}\`**\n\`\`\`${transcript}\`\`\``,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `📋 **Transcript du ticket \`${ticketId.slice(-8)}\`** (${transcript.length} caractères)`,
      files: [
        {
          name: `transcript-${ticketId.slice(-8)}.txt`,
          attachment: Buffer.from(transcript, "utf-8"),
        },
      ],
      ephemeral: true,
    });
  }
}

async function handlePanelDelete(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Serveur uniquement.", ephemeral: true });
    return;
  }

  const member = interaction.member;
  if (
    !(member as { permissions?: { has: (p: bigint) => boolean } }).permissions?.has(
      PermissionFlagsBits.ManageGuild,
    )
  ) {
    await interaction.reply({
      content: "❌ Permission `Gérer le serveur` requise.",
      ephemeral: true,
    });
    return;
  }

  const panelId = interaction.options.getString("panel_id", true);
  const deleted = await deletePanel(interaction.guildId, panelId);

  await interaction.reply({
    content: deleted ? "✅ Panneau supprimé." : "❌ Panneau introuvable.",
    ephemeral: true,
  });
}
