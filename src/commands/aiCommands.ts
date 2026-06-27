/**
 * aiCommands.ts — Commandes slash IA étendues
 *
 * CMD-16: /ai-profile — profil comportemental généré par IA
 * CMD-17: /ai-config — configure modèle IA / system prompt / température
 * CMD-18: /ai-channel-summary — résume N derniers messages d'un salon
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { requireAdmin } from "../services/permissions.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("ai-profile")
    .setDescription("Génère un profil comportemental IA d'un membre")
    .addUserOption((opt) =>
      opt.setName("membre").setDescription("Le membre à analyser").setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("ai-config")
    .setDescription("Configure l'IA du bot (modèle, prompt, température) (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("parametre")
        .setDescription("Le paramètre à configurer")
        .setRequired(true)
        .addChoices(
          { name: "model", value: "model" },
          { name: "system_prompt", value: "system_prompt" },
          { name: "temperature", value: "temperature" },
        ),
    )
    .addStringOption((opt) =>
      opt.setName("valeur").setDescription("La nouvelle valeur").setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("ai-channel-summary")
    .setDescription("Résume les N derniers messages d'un salon")
    .addIntegerOption((opt) =>
      opt
        .setName("nombre")
        .setDescription("Nombre de messages à résumer (10-100)")
        .setRequired(true)
        .setMinValue(10)
        .setMaxValue(100),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  try {
    switch (interaction.commandName) {
      case "ai-profile":
        if (!(await requireAdmin(interaction))) return;
        await handleAiProfile(interaction);
        break;
      case "ai-config":
        if (!(await requireAdmin(interaction))) return;
        await handleAiConfig(interaction);
        break;
      case "ai-channel-summary":
        await handleAiChannelSummary(interaction, client);
        break;
    }
  } catch (err) {
    logger.error("[AICommands] Erreur:", err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: "Une erreur est survenue." });
      } else {
        await interaction.reply({
          content: "Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {
      // ignore
    }
  }
}

async function generateAIResponse(prompt: string, maxTokens: number = 500): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "API IA non configurée. Configurez OPENROUTER_API_KEY.";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - AI Commands",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct:free",
        messages: [
          {
            role: "system",
            content:
              "Tu es John Helldiver, bot Discord gaming. Réponds en français, de manière concise.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || "Génération échouée.";
  } catch (error) {
    logger.error("[AICommands] Erreur IA:", error);
    return "Génération échouée. Réessayez plus tard.";
  }
}

// ===== /ai-profile =====

async function handleAiProfile(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const targetUser = interaction.options.getUser("membre", true);
  const guildId = interaction.guildId;

  // Collecter les données
  let logCount = 0;
  let modCount = 0;
  let riskScore = 0;

  try {
    logCount = await prisma.log.count({
      where: { userId: targetUser.id, guildId: guildId || undefined },
    });
  } catch {
    /* ignore */
  }
  try {
    modCount = await prisma.log.count({
      where: {
        userId: targetUser.id,
        guildId: guildId || undefined,
        type: { in: ["ban", "kick", "mute", "warn", "timeout"] },
      },
    });
  } catch {
    /* ignore */
  }
  try {
    const profile = await prisma.riskProfile.findUnique({
      where: { userId_guildId: { userId: targetUser.id, guildId: guildId || "" } },
    });
    riskScore = profile?.riskScore || 0;
  } catch {
    /* ignore */
  }

  const prompt = `Analyse ce profil Discord et génère un profil comportemental concis (5-7 lignes):
Utilisateur: ${targetUser.tag}
Total logs: ${logCount}
Sanctions: ${modCount}
Score de risque: ${riskScore}
Génère: traits de personnalité, niveau d'engagement, recommandations.`;

  const aiResult = await generateAIResponse(prompt, 400);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🧠 Profil IA — ${targetUser.tag}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .setDescription(aiResult.slice(0, 2000))
    .addFields(
      { name: "Logs", value: `${logCount}`, inline: true },
      { name: "Sanctions", value: `${modCount}`, inline: true },
      { name: "Risque", value: `${riskScore}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: "Profil généré par IA" });

  await interaction.editReply({ embeds: [embed] });
}

// ===== /ai-config =====

async function handleAiConfig(interaction: ChatInputCommandInteraction) {
  const param = interaction.options.getString("parametre", true);
  const value = interaction.options.getString("valeur", true);
  const guildId = interaction.guildId!;

  try {
    const existing = await prisma.setting.findFirst({
      where: { guildId, key: `ai:${param}` },
    });

    if (existing) {
      await prisma.setting.update({ where: { id: existing.id }, data: { value } });
    } else {
      await prisma.setting.create({ data: { guildId, key: `ai:${param}`, value } });
    }

    await interaction.reply({
      content: `✅ Paramètre IA **${param}** configuré avec succès.`,
      flags: [MessageFlags.Ephemeral],
    });
    logger.info(`[AIConfig] ${interaction.user.tag} set ${param} for guild ${guildId}`);
  } catch (error) {
    logger.error("[AIConfig] Erreur:", error);
    await interaction.reply({
      content: "Erreur lors de la configuration.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

// ===== /ai-channel-summary =====

async function handleAiChannelSummary(interaction: ChatInputCommandInteraction, _client: Client) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const count = interaction.options.getInteger("nombre", true);
  const channel = interaction.channel as TextChannel;

  try {
    const messages = await channel.messages.fetch({ limit: count });
    const sortedMessages = Array.from(messages.values()).sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );

    const conversationText = sortedMessages
      .filter((m) => !m.author.bot && m.content.length > 0)
      .slice(-50)
      .map((m) => `${m.author.username}: ${m.content.slice(0, 200)}`)
      .join("\n");

    if (!conversationText) {
      await interaction.editReply({ content: "Aucun message à résumer dans ce salon." });
      return;
    }

    const prompt = `Résume cette conversation Discord de manière concise (max 10 lignes). Identifie les sujets principaux, le ton général, et les points clés:\n\n${conversationText.slice(0, 3000)}`;

    const summary = await generateAIResponse(prompt, 400);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`📋 Résumé du salon #${channel.name}`)
      .setDescription(summary.slice(0, 2000))
      .addFields({ name: "Messages analysés", value: `${count}`, inline: true })
      .setTimestamp()
      .setFooter({ text: "Résumé généré par IA" });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[AIChannelSummary] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du résumé." });
  }
}
