import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  Client,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getOrCreateRiskProfile } from "../services/risk-engine.js";
import { handleCommand as handleAI } from "./ai.js";
import { autoTranslateIfNeeded } from "../services/libreTranslate.js";
import { buildTranslationEmbed } from "../services/embedBuilder.js";
import { assessThreat, fullModeration } from "../services/ai-moderation.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export const contextMenuCommands = [
  // ── User Context Menus ──
  new ContextMenuCommandBuilder()
    .setName("👤 Voir profil")
    .setType(ApplicationCommandType.User)
    .toJSON(),

  new ContextMenuCommandBuilder()
    .setName("📋 Voir casier")
    .setType(ApplicationCommandType.User)
    .toJSON(),

  new ContextMenuCommandBuilder()
    .setName("🤖 Analyser IA")
    .setType(ApplicationCommandType.User)
    .toJSON(),

  new ContextMenuCommandBuilder()
    .setName("⚠️ Risque score")
    .setType(ApplicationCommandType.User)
    .toJSON(),

  new ContextMenuCommandBuilder()
    .setName("🚩 Signaler")
    .setType(ApplicationCommandType.User)
    .toJSON(),

  // ── Message Context Menus ──
  new ContextMenuCommandBuilder()
    .setName("🌐 Traduire")
    .setType(ApplicationCommandType.Message)
    .toJSON(),

  new ContextMenuCommandBuilder()
    .setName("📊 Analyser sentiment")
    .setType(ApplicationCommandType.Message)
    .toJSON(),

  new ContextMenuCommandBuilder()
    .setName("📦 Extraire")
    .setType(ApplicationCommandType.Message)
    .toJSON(),

  new ContextMenuCommandBuilder()
    .setName("🚩 Rapporter")
    .setType(ApplicationCommandType.Message)
    .toJSON(),

  new ContextMenuCommandBuilder()
    .setName("🔍 Snipe")
    .setType(ApplicationCommandType.Message)
    .toJSON(),
];

export async function handleContextMenu(
  interaction: import("discord.js").ContextMenuCommandInteraction,
  client: Client,
): Promise<void> {
  const { commandName } = interaction;

  try {
    if (interaction.isUserContextMenuCommand()) {
      await handleUserContextMenu(interaction as import("discord.js").UserContextMenuCommandInteraction, client, commandName);
    } else if (interaction.isMessageContextMenuCommand()) {
      await handleMessageContextMenu(interaction as import("discord.js").MessageContextMenuCommandInteraction, client, commandName);
    }
  } catch (err) {
    logger.error(`[ContextMenu] ${commandName}: ${err instanceof Error ? err.message : String(err)}`);
    const reply = interaction.replied || interaction.deferred
      ? interaction.followUp.bind(interaction)
      : interaction.reply.bind(interaction);
    await reply({ content: "❌ Une erreur est survenue.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
  }
}

async function handleUserContextMenu(
  interaction: import("discord.js").UserContextMenuCommandInteraction,
  _client: Client,
  commandName: string,
): Promise<void> {
  const target = interaction.targetUser;

  switch (commandName) {
    case "👤 Voir profil": {
      const member = interaction.guild?.members.cache.get(target.id);
      const embed = new EmbedBuilder()
        .setTitle(`👤 Profil de ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setColor(0x5865f2)
        .addFields(
          { name: "🆔 ID", value: target.id, inline: true },
          { name: "📅 Compte créé", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
          { name: "📅 Rejoint", value: member?.joinedAt ? `<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>` : "N/A", inline: true },
          { name: "🎭 Rôles", value: member?.roles.cache.map(r => r.toString()).slice(0, 10).join(", ") || "Aucun", inline: false },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "📋 Voir casier": {
      const sanctions = await prisma.modAction.findMany({
        where: { targetId: target.id, guildId: interaction.guildId || "" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }).catch(() => []);
      const embed = new EmbedBuilder()
        .setTitle(`📋 Casier de ${target.tag}`)
        .setColor(sanctions.length > 0 ? 0xff8800 : 0x2ecc71)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setTimestamp();
      if (sanctions.length === 0) {
        embed.setDescription("✅ Aucun sanction enregistrée.");
      } else {
        embed.addFields(sanctions.map(s => ({
          name: `${s.action} — <t:${Math.floor(s.createdAt.getTime() / 1000)}:R>`,
          value: s.reason || "Aucune raison",
          inline: false,
        })));
      }
      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "🤖 Analyser IA": {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const sanctions = await prisma.modAction.findMany({
        where: { targetId: target.id, guildId: interaction.guildId || "" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }).catch(() => []);
      const userLogs = await prisma.userActivityLog.findMany({
        where: { userId: target.id, guildId: interaction.guildId || "" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }).catch(() => []);
      const activityScore = userLogs.length;
      const sanctionScore = sanctions.length;
      const accountAgeDays = Math.floor((Date.now() - target.createdTimestamp) / 86_400_000);
      const suspiciousBehaviors = sanctions.map(s => s.action);
      const history = userLogs.map(l => l.activity);
      const threat = await assessThreat({
        accountAgeDays,
        messageCount: activityScore,
        violations: sanctionScore,
        suspiciousBehaviors,
        history,
        sanctions: sanctionScore,
      });
      // Full moderation analysis on user's recent messages if available
      let modResult: Awaited<ReturnType<typeof fullModeration>> | null = null;
      try {
        const channel = interaction.channel;
        if (channel && "isTextBased" in channel && channel.isTextBased()) {
          const recentMsgs = await channel.messages.fetch({ limit: 50 });
          const userMsg = recentMsgs.filter(m => m.author.id === target.id && m.content.length > 0).first();
          if (userMsg) {
            modResult = await fullModeration(userMsg.content, {
              accountAge: `${accountAgeDays} jours`,
              violations: sanctionScore,
              riskScore: threat.risk_score,
              previousContext: history.slice(0, 5).join(" | ") || "aucun",
            });
          }
        }
      } catch { /* channel not accessible */ }
      const riskColor = threat.risk_score > 70 ? 0xe74c3c : threat.risk_score > 40 ? 0xff8800 : threat.risk_score > 20 ? 0xf1c40f : 0x2ecc71;
      const embed = new EmbedBuilder()
        .setTitle(`🤖 Analyse IA — ${target.tag}`)
        .setColor(riskColor)
        .addFields(
          { name: "🎯 Risk Score", value: `${threat.risk_score}/100`, inline: true },
          { name: "📊 Niveau", value: threat.risk_level, inline: true },
          { name: "⚡ Action", value: threat.action, inline: true },
          { name: "🔍 Facteurs", value: Object.entries(threat.factors).map(([k, v]) => `${k}: ${v}/10`).join("\n"), inline: false },
          { name: "📝 Raisonnement", value: threat.reasoning.slice(0, 1024), inline: false },
          { name: "🔐 Confiance", value: `${threat.confidence}%`, inline: true },
        )
        .setTimestamp();
      if (modResult && modResult.confidence > 0) {
        embed.addFields(
          { name: "⚖️ Modération complète", value: `Violation: ${modResult.violation ? "Oui" : "Non"} | Sévérité: ${modResult.severity}/5 | Action: ${modResult.action} | Confiance: ${modResult.confidence}%`, inline: false },
          { name: "💬 Message à l'utilisateur", value: modResult.user_message.slice(0, 1024) || "N/A", inline: false },
          { name: "📋 Mod log", value: modResult.mod_log.slice(0, 1024), inline: false },
        );
        if (modResult.rules_broken.length > 0) {
          embed.addFields({ name: "📜 Règles enfreintes", value: modResult.rules_broken.join(", "), inline: false });
        }
      }
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "⚠️ Risque score": {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      try {
        const profile = await getOrCreateRiskProfile(target.id, interaction.guildId || "");
        const embed = new EmbedBuilder()
          .setTitle(`⚠️ Score de risque — ${target.tag}`)
          .setColor(profile.riskLevel === "CRITIQUE" ? 0xe74c3c : profile.riskLevel === "ELEVE" ? 0xff8800 : 0x2ecc71)
          .addFields(
            { name: "🎯 Score", value: `${profile.riskScore}/100`, inline: true },
            { name: "📊 Niveau", value: profile.riskLevel, inline: true },
            { name: "📋 Sanctions", value: `${profile.totalSanctions}`, inline: true },
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply({ content: "❌ Impossible de calculer le score de risque." });
      }
      break;
    }

    case "🚩 Signaler": {
      const embed = new EmbedBuilder()
        .setTitle("🚩 Signalement")
        .setDescription(`Signaler ${target.toString()} au staff.\nUtilise \`/mod report\` pour un signalement détaillé.`)
        .setColor(0xff8800)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    default:
      await interaction.reply({ content: "Action inconnue.", flags: [MessageFlags.Ephemeral] });
  }
}

async function handleMessageContextMenu(
  interaction: import("discord.js").MessageContextMenuCommandInteraction,
  _client: Client,
  commandName: string,
): Promise<void> {
  const msg = interaction.targetMessage;

  switch (commandName) {
    case "🌐 Traduire": {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const result = await autoTranslateIfNeeded(msg.content || "", "fr");
      if (!result.translated) {
        await interaction.editReply({ content: "ℹ️ Le message est déjà en français ou la détection a échoué." });
        return;
      }
      const embed = buildTranslationEmbed({
        original: result.original,
        translated: result.translated_text,
        sourceLang: result.source_lang,
        targetLang: "fr",
        provider: result.provider,
      });
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "📊 Analyser sentiment": {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const content = msg.content || "";
      if (!content) {
        await interaction.editReply({ content: "❌ Message vide." });
        return;
      }
      const positive = /bon|super|génial|excellent|parfait|cool|j'aime|merci|bravo/i.test(content);
      const negative = /mauvais|nul|stupide|déteste|horrible|merde|putain|con/i.test(content);
      const sentiment = positive && !negative ? "😊 Positif" : negative && !positive ? "😠 Négatif" : "😐 Neutre";
      const embed = new EmbedBuilder()
        .setTitle("📊 Analyse de sentiment")
        .setColor(positive ? 0x2ecc71 : negative ? 0xe74c3c : 0x95a5a6)
        .addFields(
          { name: "Sentiment", value: sentiment, inline: true },
          { name: "Auteur", value: msg.author.toString(), inline: true },
          { name: "Message", value: content.slice(0, 200), inline: false },
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "📦 Extraire": {
      const content = msg.content || "";
      const urls = content.match(/https?:\/\/[^\s]+/g) || [];
      const mentions = content.match(/<@!?\d+>/g) || [];
      const channels = content.match(/<#\d+>/g) || [];
      const roles = content.match(/<@&\d+>/g) || [];
      const embed = new EmbedBuilder()
        .setTitle("📦 Extraction")
        .setColor(0x3498db)
        .addFields(
          { name: "🔗 URLs", value: urls.length > 0 ? urls.join("\n") : "Aucune", inline: false },
          { name: "👤 Mentions", value: mentions.length > 0 ? mentions.join(", ") : "Aucune", inline: true },
          { name: "📺 Salons", value: channels.length > 0 ? channels.join(", ") : "Aucun", inline: true },
          { name: "🎭 Rôles", value: roles.length > 0 ? roles.join(", ") : "Aucun", inline: true },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "🚩 Rapporter": {
      const embed = new EmbedBuilder()
        .setTitle("🚩 Message rapporté")
        .setDescription(`Message de ${msg.author.toString()} rapporté au staff.\n[Aller au message](${msg.url})`)
        .setColor(0xff8800)
        .addFields({ name: "Aperçu", value: (msg.content || "").slice(0, 200) || "*Message sans texte*" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "🔍 Snipe": {
      const embed = new EmbedBuilder()
        .setTitle("🔍 Snipe")
        .setDescription(`Message de ${msg.author.toString()}\n[Voir le message](${msg.url})`)
        .setColor(0x9b59b6)
        .addFields({ name: "Contenu", value: (msg.content || "").slice(0, 500) || "*Message sans texte*" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    default:
      await interaction.reply({ content: "Action inconnue.", flags: [MessageFlags.Ephemeral] });
  }
}
