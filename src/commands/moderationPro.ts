/**
 * moderationPro.ts — Commandes de modération avancée
 *
 * /mass-move     — Déplace tous les membres d'un salon vocal vers un autre
 * /voice-kick    — Déconnecte un utilisateur spécifique du vocal
 * /raid-shield   — Active un bouclier anti-raid temporaire (verrouillage complet)
 * /spam-analysis — Analyse le pattern de spam d'un utilisateur sur 24h
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  VoiceBasedChannel,
  PermissionFlagsBits,
  TextChannel,
  Channel,
} from "discord.js";
import logger from "../utils/logger.js";
import { requireAdmin } from "../services/permissions.js";
import { createLog, type LogEntry } from "../services/logs.js";

const FOOTER = { text: "Modération Pro • v1.0.0" };
const RAID_SHIELD_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SPAM_WINDOW_HOURS = 24;

// ─── Définitions des commandes ───────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("mass-move")
    .setDescription("Déplace tous les membres d'un salon vocal vers un autre (Admin)")
    .addChannelOption((opt) =>
      opt.setName("source").setDescription("Salon vocal source").setRequired(true),
    )
    .addChannelOption((opt) =>
      opt.setName("destination").setDescription("Salon vocal de destination").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("voice-kick")
    .setDescription("Déconnecte un utilisateur spécifique du vocal (Admin)")
    .addUserOption((opt) =>
      opt.setName("membre").setDescription("Le membre à déconnecter").setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("raison").setDescription("Raison de la déconnexion").setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("raid-shield")
    .setDescription("Active un bouclier anti-raid : verrouille le serveur 15min (Admin)")
    .addIntegerOption((opt) =>
      opt
        .setName("duree")
        .setDescription("Durée en minutes (défaut: 15, max: 60)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(60),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("spam-analysis")
    .setDescription("Analyse le pattern de spam d'un utilisateur sur 24h (Admin)")
    .addUserOption((opt) =>
      opt.setName("membre").setDescription("L'utilisateur à analyser").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),
];

// ─── Handler principal ───────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    switch (interaction.commandName) {
      case "mass-move":
        if (!(await requireAdmin(interaction))) return;
        await handleMassMove(interaction);
        break;
      case "voice-kick":
        if (!(await requireAdmin(interaction))) return;
        await handleVoiceKick(interaction);
        break;
      case "raid-shield":
        if (!(await requireAdmin(interaction))) return;
        await handleRaidShield(interaction);
        break;
      case "spam-analysis":
        if (!(await requireAdmin(interaction))) return;
        await handleSpamAnalysis(interaction);
        break;
    }
  } catch (error) {
    logger.error(
      `[ModPro] Erreur ${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ Erreur : ${String(error).slice(0, 150)}` });
      } else {
        await interaction.reply({
          content: `❌ Erreur : ${String(error).slice(0, 150)}`,
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

// ─── /mass-move ──────────────────────────────────────────────────────────────

async function handleMassMove(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const source = interaction.options.getChannel("source", true) as Channel;
  const destination = interaction.options.getChannel("destination", true) as Channel;

  if (!source.isVoiceBased() || !destination.isVoiceBased()) {
    await interaction.editReply({ content: "❌ Les deux salons doivent être des salons vocaux." });
    return;
  }

  const sourceChannel = source as VoiceBasedChannel;
  const destChannel = destination as VoiceBasedChannel;

  if (sourceChannel.id === destChannel.id) {
    await interaction.editReply({ content: "❌ Le salon source et destination sont identiques." });
    return;
  }

  const members = sourceChannel.members;
  if (members.size === 0) {
    await interaction.editReply({ content: "⚠️ Aucun membre dans le salon source." });
    return;
  }

  let moved = 0;
  let failed = 0;

  for (const [, member] of members) {
    try {
      await member.voice.setChannel(destChannel.id);
      moved++;
    } catch {
      failed++;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("📦 Mass-Move")
    .setColor(moved > 0 ? 0x57f287 : 0xed4245)
    .setDescription(`Déplacement de **${sourceChannel.name}** → **${destChannel.name}**`)
    .addFields(
      { name: "✅ Déplacés", value: `${moved}`, inline: true },
      { name: "❌ Échecs", value: `${failed}`, inline: true },
      { name: "Total", value: `${members.size}`, inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[ModPro] mass-move: ${moved}/${members.size} deplacés par ${interaction.user.tag}`);

  logAction(
    interaction.guildId,
    interaction.user.id,
    "mass_move",
    `Moved ${moved}/${members.size}`,
    JSON.stringify({ moved, failed }),
  );
}

function logAction(
  guildId: string | null,
  userId: string,
  type: string,
  action: string,
  details: string,
): void {
  const entry: LogEntry = { type, action, userId, details };
  void createLog(entry).catch(() => {});
}

// ─── /voice-kick ─────────────────────────────────────────────────────────────

async function handleVoiceKick(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const targetUser = interaction.options.getUser("membre", true);
  const reason = interaction.options.getString("raison") || "Aucune raison fournie";

  const member = interaction.guild?.members.cache.get(targetUser.id);
  if (!member) {
    await interaction.editReply({ content: "❌ Membre introuvable sur ce serveur." });
    return;
  }

  if (!member.voice?.channel) {
    await interaction.editReply({ content: "⚠️ Ce membre n'est pas dans un salon vocal." });
    return;
  }

  const channelName = member.voice.channel.name;

  try {
    await member.voice.disconnect(reason);
  } catch (error) {
    await interaction.editReply({
      content: `❌ Impossible de déconnecter ${targetUser.tag} : ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔇 Voice-Kick")
    .setColor(0xed4245)
    .setDescription(`${targetUser} a été déconnecté du salon vocal **${channelName}**.`)
    .addFields(
      { name: "Membre", value: `${targetUser.tag}`, inline: true },
      { name: "Salon", value: channelName, inline: true },
      { name: "Raison", value: reason.slice(0, 200), inline: false },
      { name: "Modérateur", value: `${interaction.user.tag}`, inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[ModPro] voice-kick: ${targetUser.tag} déconnecté par ${interaction.user.tag}`);

  logAction(
    interaction.guildId,
    interaction.user.id,
    "voice_kick",
    `Disconnected ${targetUser.tag}`,
    JSON.stringify({ target: targetUser.id, reason }),
  );
}

// ─── /raid-shield ────────────────────────────────────────────────────────────

async function handleRaidShield(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "❌ Serveur introuvable." });
    return;
  }

  const durationMin = interaction.options.getInteger("duree") || 15;
  const durationMs = durationMin * 60 * 1000;

  // Sauvegarder l'état actuel du système de vérification
  const verificationLevel = guild.verificationLevel;
  const explicitContentFilter = guild.explicitContentFilter;

  // Activer le bouclier : verrouillage maximal
  try {
    await guild.setVerificationLevel(4, "Raid Shield activé"); // Highest — phone verification
    await guild.setExplicitContentFilter(2, "Raid Shield activé"); // Scan all members
  } catch (error) {
    await interaction.editReply({
      content: `❌ Impossible d'activer le bouclier : ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🛡️ RAID SHIELD ACTIVÉ")
    .setColor(0xff4d4d)
    .setDescription(`Le serveur est en **lockdown temporaire** pendant **${durationMin} minutes**.`)
    .addFields(
      { name: "Niveau de vérification", value: "Maximum (téléphone requis)", inline: true },
      { name: "Filtre de contenu", value: "Scan tous les membres", inline: true },
      { name: "Durée", value: `${durationMin} min`, inline: true },
      { name: "Activé par", value: `${interaction.user.tag}`, inline: true },
    )
    .setFooter({ text: "Le bouclier se désactivera automatiquement" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  logger.warn(`[ModPro] RAID SHIELD activé par ${interaction.user.tag} pour ${durationMin}min`);

  // Notifier le salon de logs si configuré
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (logChannelId) {
    try {
      const logChannel = (await guild.channels.fetch(logChannelId)) as TextChannel | null;
      if (logChannel?.isTextBased()) {
        await logChannel.send({ embeds: [embed] });
      }
    } catch {}
  }

  logAction(
    guild.id,
    interaction.user.id,
    "raid_shield",
    `Shield ${durationMin}min`,
    JSON.stringify({ duration: durationMin, previousVerificationLevel: verificationLevel }),
  );

  // Désactivation automatique après la durée
  setTimeout(async () => {
    try {
      await guild.setVerificationLevel(verificationLevel);
      await guild.setExplicitContentFilter(explicitContentFilter);
      logger.info("[ModPro] RAID SHIELD désactivé automatiquement");

      if (logChannelId) {
        try {
          const logChannel = (await guild.channels.fetch(logChannelId)) as TextChannel | null;
          if (logChannel?.isTextBased()) {
            const offEmbed = new EmbedBuilder()
              .setTitle("🛡️ RAID SHIELD DÉSACTIVÉ")
              .setColor(0x57f287)
              .setDescription("Le bouclier anti-raid a expiré. Paramètres restaurés.")
              .setTimestamp();
            await logChannel.send({ embeds: [offEmbed] });
          }
        } catch {}
      }
    } catch (error) {
      logger.error(
        `[ModPro] Erreur désactivation raid shield: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, durationMs);
}

// ─── /spam-analysis ──────────────────────────────────────────────────────────

async function handleSpamAnalysis(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const targetUser = interaction.options.getUser("membre", true);
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "❌ Serveur introuvable." });
    return;
  }

  // Récupérer les messages récents depuis les salons textuels via l'API Discord
  const sinceTimestamp = Date.now() - SPAM_WINDOW_HOURS * 60 * 60 * 1000;
  const textChannels = guild.channels.cache.filter(
    (c): c is TextChannel => c.isTextBased() && !c.isThread(),
  );

  interface CollectedMessage {
    content: string;
    createdAt: number;
    channelId: string;
  }

  const allMessages: CollectedMessage[] = [];
  const channelsToScan = textChannels.first(10);

  for (const channel of channelsToScan) {
    try {
      let lastId: string | undefined;
      for (let batch = 0; batch < 3; batch++) {
        const messages = await channel.messages.fetch({
          limit: 100,
          ...(lastId ? { before: lastId } : {}),
        });
        if (messages.size === 0) break;

        for (const [, msg] of messages) {
          if (msg.createdTimestamp < sinceTimestamp) {
            lastId = undefined;
            break;
          }
          if (msg.author.id === targetUser.id) {
            allMessages.push({
              content: msg.content,
              createdAt: msg.createdTimestamp,
              channelId: channel.id,
            });
          }
        }
        if (!lastId) break;
        lastId = messages.last()?.id;
      }
    } catch {
      // Skip channel si inaccessible
    }
  }

  if (allMessages.length === 0) {
    await interaction.editReply({
      content: `⚠️ Aucun message trouvé pour ${targetUser.tag} dans les dernières ${SPAM_WINDOW_HOURS}h.`,
    });
    return;
  }

  // ─── Analyse des patterns ──────────────────────────────────────────────────
  allMessages.sort((a, b) => a.createdAt - b.createdAt);

  const totalMessages = allMessages.length;
  const channelsUsed = new Set(allMessages.map((m) => m.channelId)).size;

  // Détection de répétition (messages identiques)
  const contentCounts = new Map<string, number>();
  for (const msg of allMessages) {
    const normalized = msg.content.trim().toLowerCase().slice(0, 200);
    if (normalized) {
      contentCounts.set(normalized, (contentCounts.get(normalized) ?? 0) + 1);
    }
  }

  const duplicates = [...contentCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const duplicateCount = duplicates.reduce((sum, [, count]) => sum + count, 0);
  const duplicateRatio = ((duplicateCount / totalMessages) * 100).toFixed(1);

  // Détection de bursts (pics de messages rapprochés)
  let maxBurst = 0;
  let burstStartTime: number | null = null;
  const BURST_WINDOW_MS = 3000; // 3 secondes

  for (let i = 0; i < allMessages.length; i++) {
    const windowEnd = allMessages[i].createdAt + BURST_WINDOW_MS;
    let burstCount = 1;
    for (let j = i + 1; j < allMessages.length; j++) {
      if (allMessages[j].createdAt <= windowEnd) {
        burstCount++;
      } else {
        break;
      }
    }
    if (burstCount > maxBurst) {
      maxBurst = burstCount;
      burstStartTime = allMessages[i].createdAt;
    }
  }

  // Calcul du ratio caps / emojis / mentions
  let capsMessages = 0;
  let emojiHeavyMessages = 0;
  let mentionHeavyMessages = 0;

  for (const msg of allMessages) {
    const content = msg.content;
    if (content.length > 10) {
      const capsRatio = (content.match(/[A-Z]/g)?.length ?? 0) / content.length;
      if (capsRatio > 0.6) capsMessages++;
    }
    const emojiCount = (content.match(/[\p{Emoji}]/gu) ?? []).length;
    if (emojiCount >= 3) emojiHeavyMessages++;
    const mentionCount = (content.match(/<@!?\d+>/g) ?? []).length;
    if (mentionCount >= 2) mentionHeavyMessages++;
  }

  // Score de spam (composite)
  const spamScore = Math.min(
    100,
    Math.round(
      (duplicateCount / totalMessages) * 30 +
        (maxBurst >= 5 ? 25 : (maxBurst / 5) * 25) +
        (capsMessages / totalMessages) * 100 * 0.15 +
        (mentionHeavyMessages / totalMessages) * 100 * 0.15 +
        (channelsUsed === 1 ? 15 : 0),
    ),
  );

  // Verdict
  let verdict: string;
  let verdictColor: number;
  if (spamScore >= 70) {
    verdict = "🔴 SPAMMEUR CONFIRMÉ";
    verdictColor = 0xed4245;
  } else if (spamScore >= 40) {
    verdict = "🟡 Comportement suspect";
    verdictColor = 0xeeeeee;
  } else {
    verdict = "🟢 Comportement normal";
    verdictColor = 0x57f287;
  }

  const duplicateText = duplicates
    .map(([content, count]) => `×${count}: "${content.slice(0, 60)}"`)
    .join("\n")
    .slice(0, 1024);

  const embed = new EmbedBuilder()
    .setTitle("🔍 Analyse de Spam")
    .setColor(verdictColor)
    .setDescription(`Analyse de **${targetUser.tag}** sur les dernières ${SPAM_WINDOW_HOURS}h`)
    .addFields(
      { name: "📊 Score de spam", value: `${spamScore}/100`, inline: true },
      { name: "🏷️ Verdict", value: verdict, inline: true },
      { name: "💬 Total messages", value: `${totalMessages}`, inline: true },
      {
        name: "🔄 Messages dupliqués",
        value: `${duplicateCount} (${duplicateRatio}%)`,
        inline: true,
      },
      { name: "⚡ Burst max (3s)", value: `${maxBurst} msgs`, inline: true },
      { name: "📍 Salons utilisés", value: `${channelsUsed}`, inline: true },
      {
        name: "🔠 Caps lock",
        value: `${capsMessages} (${((capsMessages / totalMessages) * 100).toFixed(0)}%)`,
        inline: true,
      },
      { name: "🎯 Mentions lourdes", value: `${mentionHeavyMessages}`, inline: true },
      { name: "😄 Emojis lourds", value: `${emojiHeavyMessages}`, inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  if (duplicateText) {
    embed.addFields({
      name: "🔁 Top duplications",
      value: duplicateText || "Aucune",
      inline: false,
    });
  }

  if (burstStartTime) {
    embed.addFields({
      name: "⏱️ Pic d'activité",
      value: `${maxBurst} messages en 3s à <t:${Math.floor(burstStartTime / 1000)}:R>`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
  logger.info(
    `[ModPro] spam-analysis: ${targetUser.tag} score=${spamScore} par ${interaction.user.tag}`,
  );

  logAction(
    guild.id,
    interaction.user.id,
    "spam_analysis",
    `Analyzed ${targetUser.tag}: score=${spamScore}`,
    JSON.stringify({ target: targetUser.id, spamScore, totalMessages }),
  );
}
