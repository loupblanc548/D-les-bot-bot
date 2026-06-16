import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
} from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import logger from "../utils/logger";
import { requireAdmin } from "../services/permissions";

const FOOTER = { text: "Système Vocal • v1.0.0" };

// ─── Définition de la commande ───────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("vocal")
    .setDescription("Gérer la connexion vocale du bot")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Action à effectuer")
        .setRequired(true)
        .addChoices(
          { name: "🔊 Rejoindre", value: "rejoindre" },
          { name: "🔇 Quitter", value: "quitter" }
        )
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
