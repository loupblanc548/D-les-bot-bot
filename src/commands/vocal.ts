import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
  ChannelType,
} from "discord.js";
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import logger from "../utils/logger.js";
import { requireAdmin } from "../services/permissions.js";
import {
  setHubChannel,
  clearHubCache,
  lockTempVoice,
  unlockTempVoice,
  renameTempVoice,
  limitTempVoice,
  transferTempVoiceOwnership,
} from "../services/tempVoiceService.js";

const FOOTER = { text: "Système Vocal • v2.0.0" };

// ─── Définition de la commande ───────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("vocal")
    .setDescription("Gérer la connexion vocale et les salons temporaires")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Action à effectuer")
        .setRequired(true)
        .addChoices(
          { name: "🔊 Rejoindre", value: "rejoindre" },
          { name: "🔇 Quitter", value: "quitter" },
          { name: "🏠 Définir le hub vocal", value: "temp-setup" },
          { name: "🔒 Verrouiller mon salon", value: "temp-lock" },
          { name: "🔓 Déverrouiller mon salon", value: "temp-unlock" },
          { name: "✏️ Renommer mon salon", value: "temp-rename" },
          { name: "👥 Limiter mon salon", value: "temp-limit" },
          { name: "🔑 Transférer la propriété", value: "temp-transfer" },
        ),
    )
    .addChannelOption((o) =>
      o
        .setName("salon")
        .setDescription("Salon vocal hub (pour temp-setup)")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false),
    )
    .addStringOption((o) =>
      o.setName("nom").setDescription("Nouveau nom (pour temp-rename)").setRequired(false),
    )
    .addIntegerOption((o) =>
      o
        .setName("limite")
        .setDescription("Limite d'utilisateurs (pour temp-limit)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(99),
    )
    .addUserOption((o) =>
      o
        .setName("utilisateur")
        .setDescription("Nouveau propriétaire (pour temp-transfer)")
        .setRequired(false),
    )
    .toJSON(),
];

// ─── Handler principal ────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  const action = interaction.options.getString("action", true);

  try {
    if (action === "rejoindre") {
      await handleJoin(interaction);
    } else if (action === "quitter") {
      await handleLeave(interaction);
    } else if (action === "temp-setup") {
      await handleTempSetup(interaction);
    } else if (action === "temp-lock") {
      await handleTempLock(interaction);
    } else if (action === "temp-unlock") {
      await handleTempUnlock(interaction);
    } else if (action === "temp-rename") {
      await handleTempRename(interaction);
    } else if (action === "temp-limit") {
      await handleTempLimit(interaction);
    } else if (action === "temp-transfer") {
      await handleTempTransfer(interaction);
    }
  } catch (error) {
    logger.error("[Vocal] Erreur:", String(error));
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ Erreur : ${String(error).slice(0, 150)}`,
        });
      } else {
        await interaction.reply({
          content: `❌ Erreur : ${String(error).slice(0, 150)}`,
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

// ─── /vocal rejoindre ────────────────────────────────────────────────────────

async function handleJoin(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.editReply({
      content: "❌ Vous devez être dans un salon vocal pour utiliser cette commande.",
    });
    return;
  }

  if (!voiceChannel.joinable) {
    await interaction.editReply({
      content: "❌ Je n'ai pas la permission de rejoindre ce salon vocal.",
    });
    return;
  }

  const existing = getVoiceConnection(interaction.guildId!);
  if (existing) {
    logger.info("[Vocal] Connexion précédente détruite pour rejoindre un autre salon");
    if (existing.joinConfig.channelId === voiceChannel.id) {
      await interaction.editReply({
        content: `⚠️ Je suis déjà dans **${voiceChannel.name}** !`,
      });
      return;
    }
    existing.destroy();
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId!,
    adapterCreator: interaction.guild!.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  connection.once(VoiceConnectionStatus.Disconnected, () => {
    logger.info("[Vocal] Déconnecté du salon vocal");
  });

  const embed = new EmbedBuilder()
    .setTitle("🔊 Connexion vocale")
    .setColor(0x57f287)
    .setDescription(`J'ai rejoint le salon vocal **${voiceChannel.name}** !`)
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[Vocal] ▶ ${interaction.user.tag} → rejoint "${voiceChannel.name}"`);
}

// ─── /vocal quitter ──────────────────────────────────────────────────────────

async function handleLeave(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const connection = getVoiceConnection(interaction.guildId!);

  if (!connection) {
    await interaction.editReply({
      content: "⚠️ Je ne suis actuellement dans aucun salon vocal.",
    });
    return;
  }

  const channelName = connection.joinConfig.channelId ?? "inconnu";
  connection.destroy();

  const embed = new EmbedBuilder()
    .setTitle("🔇 Déconnexion vocale")
    .setColor(0xed4245)
    .setDescription("Je me suis déconnecté du salon vocal.")
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[Vocal] ■ ${interaction.user.tag} → quitté (salon ${channelName})`);
}

// ─── Temp Voice Handlers ─────────────────────────────────────────────────────

async function handleTempSetup(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel("salon");
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await interaction.reply({
      content: "❌ Spécifie un salon vocal valide.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await setHubChannel(interaction.guildId!, channel.id);
  clearHubCache(interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🏠 Hub vocal configuré")
    .setDescription(`Les salons temporaires seront créés quand quelqu'un rejoint ${channel}.`)
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleTempLock(interaction: ChatInputCommandInteraction) {
  const channelId = (interaction.member as GuildMember)?.voice?.channelId;
  if (!channelId) {
    await interaction.reply({
      content: "❌ Tu dois être dans un salon vocal.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const success = await lockTempVoice(interaction.guild!, channelId, interaction.user.id);
  await interaction.reply({
    content: success ? "🔒 Salon verrouillé." : "❌ Tu n'es pas le propriétaire de ce salon.",
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleTempUnlock(interaction: ChatInputCommandInteraction) {
  const channelId = (interaction.member as GuildMember)?.voice?.channelId;
  if (!channelId) {
    await interaction.reply({
      content: "❌ Tu dois être dans un salon vocal.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const success = await unlockTempVoice(interaction.guild!, channelId, interaction.user.id);
  await interaction.reply({
    content: success ? "🔓 Salon déverrouillé." : "❌ Tu n'es pas le propriétaire de ce salon.",
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleTempRename(interaction: ChatInputCommandInteraction) {
  const channelId = (interaction.member as GuildMember)?.voice?.channelId;
  const name = interaction.options.getString("nom");
  if (!channelId || !name) {
    await interaction.reply({
      content: "❌ Tu dois être dans un salon vocal et spécifier un nom.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const success = await renameTempVoice(interaction.guild!, channelId, interaction.user.id, name);
  await interaction.reply({
    content: success
      ? `✏️ Salon renommé en "${name}".`
      : "❌ Tu n'es pas le propriétaire de ce salon.",
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleTempLimit(interaction: ChatInputCommandInteraction) {
  const channelId = (interaction.member as GuildMember)?.voice?.channelId;
  const limit = interaction.options.getInteger("limite");
  if (!channelId || limit === null) {
    await interaction.reply({
      content: "❌ Tu dois être dans un salon vocal et spécifier une limite.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const success = await limitTempVoice(interaction.guild!, channelId, interaction.user.id, limit);
  await interaction.reply({
    content: success
      ? `👥 Limite fixée à ${limit} utilisateurs.`
      : "❌ Tu n'es pas le propriétaire de ce salon.",
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleTempTransfer(interaction: ChatInputCommandInteraction) {
  const channelId = (interaction.member as GuildMember)?.voice?.channelId;
  const newOwner = interaction.options.getUser("utilisateur");
  if (!channelId || !newOwner) {
    await interaction.reply({
      content: "❌ Tu dois être dans un salon vocal et spécifier un utilisateur.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const success = transferTempVoiceOwnership(channelId, interaction.user.id, newOwner.id);
  await interaction.reply({
    content: success
      ? `🔑 Propriété transférée à ${newOwner.toString()}.`
      : "❌ Tu n'es pas le propriétaire de ce salon.",
    flags: [MessageFlags.Ephemeral],
  });
}
