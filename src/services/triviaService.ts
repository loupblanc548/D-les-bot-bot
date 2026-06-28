/**
 * triviaService.ts — Jeu de trivia avec OpenTriviaDB (gratuit, sans clé API)
 *
 * - Questions multilingues (français/anglais)
 * - Catégories configurables
 * - Score persisté en DB
 * - Parties multi-joueurs
 */

import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const API_URL = "https://opentdb.com/api.php";

interface TriviaQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  all_answers: string[];
}

interface ActiveGame {
  question: TriviaQuestion;
  startTime: number;
  answered: Set<string>;
}

const activeGames = new Map<string, ActiveGame>();

const CATEGORIES: Record<number, string> = {
  9: "Culture Générale",
  10: "Livres",
  11: "Films",
  12: "Musique",
  14: "Télévision",
  15: "Jeux Vidéo",
  16: "Jeux de Sociau",
  17: "Science & Nature",
  18: "Informatique",
  19: "Mathématiques",
  20: "Mythologie",
  21: "Sports",
  22: "Géographie",
  23: "Histoire",
  24: "Politique",
  25: "Art",
  26: "Célébrités",
  27: "Animaux",
  28: "Véhicules",
  29: "Comics",
  30: "Gadgets",
  31: "Anime/Manga",
  32: "Dessins Animés",
};

export function getCategoryList(): Array<{ id: number; name: string }> {
  return Object.entries(CATEGORIES).map(([id, name]) => ({ id: Number(id), name }));
}

/**
 * Récupère une question depuis OpenTriviaDB.
 */
async function fetchQuestion(opts?: {
  category?: number;
  difficulty?: "easy" | "medium" | "hard";
}): Promise<TriviaQuestion | null> {
  try {
    const params = new URLSearchParams({
      amount: "1",
      type: "multiple",
      encode: "url3986",
    });

    if (opts?.category) params.set("category", String(opts.category));
    if (opts?.difficulty) params.set("difficulty", opts.difficulty);

    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      response_code: number;
      results: Array<{
        category: string;
        type: string;
        difficulty: string;
        question: string;
        correct_answer: string;
        incorrect_answers: string[];
      }>;
    };

    if (data.response_code !== 0 || !data.results[0]) return null;

    const q = data.results[0];
    const allAnswers = [q.correct_answer, ...q.incorrect_answers]
      .map((a) => decodeURIComponent(a))
      .sort(() => Math.random() - 0.5);

    return {
      category: decodeURIComponent(q.category),
      type: q.type,
      difficulty: q.difficulty,
      question: decodeURIComponent(q.question),
      correct_answer: decodeURIComponent(q.correct_answer),
      incorrect_answers: q.incorrect_answers.map((a) => decodeURIComponent(a)),
      all_answers: allAnswers,
    };
  } catch (error) {
    logger.error("[Trivia] Fetch error:", error);
    return null;
  }
}

/**
 * Démarre une partie de trivia.
 */
export async function startTrivia(
  interaction: ChatInputCommandInteraction,
  opts?: { category?: number; difficulty?: "easy" | "medium" | "hard" },
): Promise<void> {
  await interaction.deferReply();

  const question = await fetchQuestion(opts);
  if (!question) {
    await interaction.editReply("❌ Impossible de récupérer une question. Réessaie plus tard.");
    return;
  }

  const channelId = interaction.channelId;
  activeGames.set(channelId, {
    question,
    startTime: Date.now(),
    answered: new Set(),
  });

  const difficultyEmoji =
    question.difficulty === "easy" ? "🟢" : question.difficulty === "medium" ? "🟡" : "🔴";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${difficultyEmoji} Trivia — ${question.category}`)
    .setDescription(question.question)
    .setFooter({ text: `Difficulté: ${question.difficulty} • 30 secondes pour répondre` })
    .setTimestamp();

  const buttons = question.all_answers.map((answer, i) =>
    new ButtonBuilder()
      .setCustomId(`trivia_${i}`)
      .setLabel(`${String.fromCharCode(65 + i)}. ${answer.slice(0, 70)}`)
      .setStyle(ButtonStyle.Secondary),
  );

  // Max 5 buttons per row
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }

  await interaction.editReply({ embeds: [embed], components: rows });

  // Timeout : révéler la réponse après 30s
  setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;

    const correctIndex = game.question.all_answers.indexOf(game.question.correct_answer);
    const resultEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("⏰ Temps écoulé !")
      .setDescription(`La réponse était:\n**${String.fromCharCode(65 + correctIndex)}. ${game.question.correct_answer}**`)
      .setFooter({ text: "Utilise /fun trivia pour rejouer" });

    try {
      await interaction.editReply({ embeds: [resultEmbed], components: [] });
    } catch {
      // message may be deleted
    }
    activeGames.delete(channelId);
  }, 30_000);
}

/**
 * Gère la réponse à un bouton de trivia.
 */
export async function handleTriviaButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("trivia_")) return false;

  const game = activeGames.get(interaction.channelId);
  if (!game) {
    await interaction.reply({ content: "❌ Aucune partie active.", flags: [MessageFlags.Ephemeral] });
    return true;
  }

  if (game.answered.has(interaction.user.id)) {
    await interaction.reply({ content: "❌ Tu as déjà répondu !", flags: [MessageFlags.Ephemeral] });
    return true;
  }

  game.answered.add(interaction.user.id);

  const answerIndex = parseInt(interaction.customId.split("_")[1], 10);
  const isCorrect = game.question.all_answers[answerIndex] === game.question.correct_answer;

  if (isCorrect) {
    // Sauvegarder le score
    await saveTriviaScore(interaction.user.id, interaction.user.username, 1).catch(() => {});

    const timeTaken = ((Date.now() - game.startTime) / 1000).toFixed(1);
    await interaction.reply({
      content: `✅ **${interaction.user.username}** a la bonne réponse en ${timeTaken}s ! (+1 point)`,
    });

    // Révéler la réponse et terminer
    const correctIndex = game.question.all_answers.indexOf(game.question.correct_answer);
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Bonne réponse !")
      .setDescription(`**${game.question.correct_answer}**`)
      .setFooter({ text: `Gagné par ${interaction.user.username} en ${timeTaken}s` });

    try {
      await interaction.message.edit({ embeds: [embed], components: [] });
    } catch {
      // ignore
    }
    activeGames.delete(interaction.channelId);
  } else {
    await interaction.reply({
      content: `❌ Mauvaise réponse, ${interaction.user.username} !`,
      flags: [MessageFlags.Ephemeral],
    });
  }

  return true;
}

/**
 * Sauvegarde ou met à jour le score trivia d'un utilisateur.
 */
async function saveTriviaScore(discordId: string, _username: string, points: number): Promise<void> {
  try {
    await prisma.user.upsert({
      where: { discordId },
      create: {
        discordId,
        balance: points,
      },
      update: {
        balance: { increment: points },
      },
    });
  } catch {
    // ignore DB errors
  }
}

/**
 * Récupère le top 10 des scores trivia.
 */
export async function getTriviaLeaderboard(): Promise<Array<{ discordId: string; balance: number }>> {
  try {
    return await prisma.user.findMany({
      where: { balance: { gt: 0 } },
      orderBy: { balance: "desc" },
      take: 10,
      select: { discordId: true, balance: true },
    });
  } catch {
    return [];
  }
}
