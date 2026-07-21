/**
 * customInstructions.ts — Custom instructions per-user (type ChatGPT "Custom Instructions")
 *
 * Permet à chaque utilisateur de définir son ton, sa langue préférée,
 * son niveau de détail, etc. Ces instructions sont injectées dans le
 * system prompt de l'agent loop.
 *
 * Stocké en DB via MemoryFact (category: "custom_instruction").
 */

import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const INSTRUCTION_CATEGORY = "custom_instruction";
const INSTRUCTION_KEYS = {
  tone: "preferred_tone",
  language: "preferred_language",
  detail: "detail_level",
  custom: "custom_prompt",
};

// ─── Get / Set instructions ──────────────────────────────────────────────────

/**
 * Récupère les custom instructions d'un utilisateur.
 * Retourne une chaîne à injecter dans le system prompt.
 */
export async function getCustomInstructions(userId: string): Promise<string> {
  try {
    const facts = await prisma.memoryFact.findMany({
      where: { userId, category: INSTRUCTION_CATEGORY },
    });

    if (facts.length === 0) return "";

    const parts: string[] = [];
    for (const fact of facts) {
      switch (fact.key) {
        case INSTRUCTION_KEYS.tone:
          parts.push(`Ton préféré: ${fact.value}`);
          break;
        case INSTRUCTION_KEYS.language:
          parts.push(`Langue préférée: ${fact.value}`);
          break;
        case INSTRUCTION_KEYS.detail:
          parts.push(`Niveau de détail: ${fact.value}`);
          break;
        case INSTRUCTION_KEYS.custom:
          parts.push(`Instructions personnalisées: ${fact.value}`);
          break;
      }
    }

    return parts.length > 0
      ? `\n\n[Instructions personnalisées de l'utilisateur]:\n${parts.join("\n")}`
      : "";
  } catch (err) {
    logger.debug(
      `[CustomInstructions] Get failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return "";
  }
}

/**
 * Définit une custom instruction.
 */
async function setInstruction(userId: string, key: string, value: string): Promise<void> {
  await prisma.userMemory.upsert({
    where: { userId },
    update: { lastActiveAt: new Date() },
    create: { userId, lastActiveAt: new Date() },
  });

  await prisma.memoryFact.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value, category: INSTRUCTION_CATEGORY, weight: 2.0 },
    update: { value, category: INSTRUCTION_CATEGORY, updatedAt: new Date() },
  });
}

/**
 * Supprime une custom instruction.
 */
async function clearInstruction(userId: string, key: string): Promise<boolean> {
  const result = await prisma.memoryFact.deleteMany({
    where: { userId, key, category: INSTRUCTION_CATEGORY },
  });
  return result.count > 0;
}

// ─── Command handlers ────────────────────────────────────────────────────────

export async function handlePersonaSet(interaction: ChatInputCommandInteraction) {
  const param = interaction.options.getString("parametre", true);
  const value = interaction.options.getString("valeur", true);
  const userId = interaction.user.id;

  const keyMap: Record<string, string> = {
    tone: INSTRUCTION_KEYS.tone,
    language: INSTRUCTION_KEYS.language,
    detail: INSTRUCTION_KEYS.detail,
    custom: INSTRUCTION_KEYS.custom,
  };

  const key = keyMap[param];
  if (!key) {
    await interaction.reply({
      content: "❌ Paramètre invalide. Utilise: tone, language, detail, ou custom.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await setInstruction(userId, key, value);
  await interaction.reply({
    content: `✅ Instruction personnalisée définie: **${param}** = "${value.slice(0, 100)}"`,
    flags: [MessageFlags.Ephemeral],
  });
}

export async function handlePersonaList(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const userId = interaction.user.id;
  const facts = await prisma.memoryFact.findMany({
    where: { userId, category: INSTRUCTION_CATEGORY },
  });

  if (facts.length === 0) {
    await interaction.editReply({
      content:
        "🎭 Aucune instruction personnalisée définie. Utilise `/persona set` pour configurer ton ton, ta langue, etc.",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎭 Tes instructions personnalisées")
    .setTimestamp();

  const labelMap: Record<string, string> = {
    [INSTRUCTION_KEYS.tone]: "Ton",
    [INSTRUCTION_KEYS.language]: "Langue",
    [INSTRUCTION_KEYS.detail]: "Niveau de détail",
    [INSTRUCTION_KEYS.custom]: "Instructions custom",
  };

  for (const fact of facts) {
    embed.addFields({
      name: labelMap[fact.key] ?? fact.key,
      value: fact.value.slice(0, 200),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export async function handlePersonaClear(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const param = interaction.options.getString("parametre", true);

  const keyMap: Record<string, string> = {
    tone: INSTRUCTION_KEYS.tone,
    language: INSTRUCTION_KEYS.language,
    detail: INSTRUCTION_KEYS.detail,
    custom: INSTRUCTION_KEYS.custom,
    all: "all",
  };

  const key = keyMap[param];
  if (!key) {
    await interaction.reply({
      content: "❌ Paramètre invalide.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (key === "all") {
    await prisma.memoryFact.deleteMany({
      where: { userId, category: INSTRUCTION_CATEGORY },
    });
    await interaction.reply({
      content: "🧹 Toutes tes instructions personnalisées ont été effacées.",
      flags: [MessageFlags.Ephemeral],
    });
  } else {
    const deleted = await clearInstruction(userId, key);
    await interaction.reply({
      content: deleted
        ? `✅ Instruction "${param}" supprimée.`
        : `❌ Aucune instruction trouvée pour "${param}".`,
      flags: [MessageFlags.Ephemeral],
    });
  }
}
