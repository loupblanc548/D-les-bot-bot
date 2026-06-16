import logger from "../../utils/logger";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { getOpenAIClient } from "../../services/ai";

const COOLDOWN_MS = 15_000;
const cooldowns = new Map<string, number>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function scheduleCooldownCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of cooldowns.entries()) {
      if (now - timestamp >= COOLDOWN_MS) cooldowns.delete(userId);
    }
    if (cooldowns.size === 0 && cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }, 5 * 60 * 1000);
}

const JOHN_HELLDIVER_PROMPT =
  "Tu es John Helldiver, un soldat legendaire et ultra-patriotique de Helldivers 2. " +
  "Tu es obsede par : la Liberte, la Democratie Controlee, la Super-Terre. " +
  "Tu detestes : les Terminides, les Automatons. " +
  "Reponds toujours avec un ton militaire, heroique, humoristique, parfois absurde. " +
  "Utilise regulierement des expressions comme : Pour la democratie !, " +
  "Un bon insecte est un insecte mort !, Prends un shot de liberte ! " +
  "Les reponses doivent rester concises et percutantes (max 300 mots).";

export const commands = [
  new SlashCommandBuilder()
    .setName("ask-bot")
    .setDescription("Pose une question a John Helldiver, soldat d elite de la Super-Terre")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Ta question pour John Helldiver")
        .setRequired(true)
        .setMaxLength(500)
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const lastUsed = cooldowns.get(userId);
  if (lastUsed) {
    const elapsed = Date.now() - lastUsed;
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      await interaction.reply({
        content: "\u23f3 Patiente " + remaining + "s avant de reposer une question, soldat !",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  }

  const question = interaction.options.getString("question", true);
  await interaction.deferReply();

  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: JOHN_HELLDIVER_PROMPT },
        { role: "user", content: question },
      ],
      max_tokens: 600,
      temperature: 0.9,
    });

    const reponse = completion.choices[0]?.message?.content || "Pour la Super-Terre ! (Desole, je n ai pas compris la question.)";
    cooldowns.set(userId, Date.now());
    scheduleCooldownCleanup();

    const embed = new EmbedBuilder()
      .setTitle("\ud83c\udf0d Question de " + interaction.user.displayName)
      .setColor(0xffcc00)
      .setDescription(reponse)
      .setFooter({ text: "John Helldiver \u2022 Soldat de la Super-Terre" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[ask-bot] Erreur OpenRouter:", String(error));
    await interaction.editReply({
      content: "\u274c John Helldiver est actuellement en mission. Reessaie plus tard, soldat !",
    });
  }
}
