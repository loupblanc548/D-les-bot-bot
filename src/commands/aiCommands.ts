/**
 * aiCommands.ts — Configuration IA
 *
 * /ai-config — configure modèle IA / system prompt / température
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { requireAdmin } from "../services/permissions.js";

export const commands = [
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
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  try {
    switch (interaction.commandName) {
      case "ai-config":
        if (!(await requireAdmin(interaction))) return;
        await handleAiConfig(interaction);
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
        model: "meta-llama/llama-3.2-3b-instruct:free",
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
