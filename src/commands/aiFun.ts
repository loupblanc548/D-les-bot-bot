/**
 * aiFun.ts — /ai-fun (groupe de 18 subcommands)
 *
 * Commandes ludiques basées sur l'IA (OpenRouter) :
 * summarize, roast, compliment, debate, headline, fortune, story,
 * pickup-line, insult, rewrite, explain, predict, quiz, therapy,
 * timecapsule, two-truths, vibe-check, gaming-personality
 */

import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { OpenAI } from "openai";
import logger from "../utils/logger.js";
import { recall } from "../services/aiMemory.js";

const FOOTER = { text: "AI Fun • Powered by OpenRouter" };

const AI_MODEL = process.env.OPENROUTER_MODEL || "z-ai/glm-4.6:free";
const MAX_TOKENS = 500;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
}

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getClient();
  if (!client) {
    return "❌ IA non configurée (OPENROUTER_API_KEY manquant).";
  }
  try {
    const res = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || "❌ Réponse vide de l'IA.";
  } catch (error) {
    logger.error(`[AIFun] LLM error: ${error instanceof Error ? error.message : String(error)}`);
    return "❌ L'IA a rencontré une erreur. Réessaie plus tard.";
  }
}

async function getUserContext(userId: string): Promise<string> {
  try {
    const snap = await recall(userId, { limit: 15, includeMessages: false });
    if (snap.facts.length === 0) return "Aucune mémoire disponible.";
    return snap.facts.map((f) => `- ${f.key}: ${f.value}`).join("\n");
  } catch {
    return "Aucune mémoire disponible.";
  }
}

// ─── Définitions des commandes ───────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("ai-fun")
    .setDescription("Commandes IA ludiques")
    .addSubcommand((s) =>
      s
        .setName("summarize")
        .setDescription("Résume les N derniers messages du salon")
        .addIntegerOption((o) =>
          o
            .setName("nombre")
            .setDescription("Nombre de messages (défaut: 20)")
            .setMinValue(5)
            .setMaxValue(100)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) => s.setName("roast").setDescription("Roast humoristique personnalisé"))
    .addSubcommand((s) =>
      s.setName("compliment").setDescription("Compliment personnalisé basé sur ta mémoire"),
    )
    .addSubcommand((s) =>
      s
        .setName("debate")
        .setDescription("L'IA argumente un côté d'un sujet")
        .addStringOption((o) =>
          o.setName("sujet").setDescription("Le sujet à débattre").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("cote")
            .setDescription("Côté à défendre")
            .setRequired(false)
            .addChoices({ name: "Pour", value: "for" }, { name: "Contre", value: "against" }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("headline")
        .setDescription("Génère un titre journalistique d'un sujet")
        .addStringOption((o) =>
          o.setName("sujet").setDescription("Le sujet du titre").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("fortune").setDescription("Prédiction d'avenir gaming personnalisée"),
    )
    .addSubcommand((s) =>
      s.setName("story").setDescription("Histoire courte héroïque avec toi en personnage"),
    )
    .addSubcommand((s) => s.setName("pickup-line").setDescription("Phrase d'approche gaming"))
    .addSubcommand((s) =>
      s.setName("insult").setDescription("Insulte Helldivers non-toxique et créative"),
    )
    .addSubcommand((s) =>
      s
        .setName("rewrite")
        .setDescription("Réécrit ton texte dans un autre ton")
        .addStringOption((o) =>
          o.setName("texte").setDescription("Le texte à réécrire").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("ton")
            .setDescription("Ton à utiliser")
            .setRequired(true)
            .addChoices(
              { name: "Shakespeare", value: "shakespeare" },
              { name: "Pirate", value: "pirate" },
              { name: "Robot", value: "robot" },
              { name: "Gamer tryhard", value: "gamer" },
              { name: "Vampire", value: "vampire" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("explain")
        .setDescription("Explique un concept simplement")
        .addStringOption((o) =>
          o.setName("concept").setDescription("Le concept à expliquer").setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("predict").setDescription("Prédit ce que tu vas dire ensuite"))
    .addSubcommand((s) => s.setName("quiz").setDescription("Quiz sur toi basé sur ta mémoire"))
    .addSubcommand((s) => s.setName("therapy").setDescription("Fausse thérapie gaming"))
    .addSubcommand((s) =>
      s
        .setName("timecapsule")
        .setDescription("Message à ton toi du futur")
        .addStringOption((o) =>
          o.setName("message").setDescription("Le message pour ton futur toi").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("two-truths").setDescription("Two truths and a lie basé sur ta mémoire"),
    )
    .addSubcommand((s) => s.setName("vibe-check").setDescription("Évaluation de ton vibe actuel"))
    .addSubcommand((s) =>
      s
        .setName("gaming-personality")
        .setDescription("Type de personnalité gaming basé sur ta mémoire"),
    )
    .toJSON(),
];

// ─── Handler principal ───────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const userTag = interaction.user.tag;

  await interaction.deferReply();

  try {
    let result: string;
    let title: string;
    let color: number;

    switch (sub) {
      case "summarize": {
        const count = interaction.options.getInteger("nombre") ?? 20;
        result = await handleSummarize(interaction, count);
        title = "📋 Résumé";
        color = 0x5865f2;
        break;
      }
      case "roast": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es un comédien qui fait des roasts humoristiques. Reste léger, jamais méchant. Utilise la mémoire de l'utilisateur pour personnaliser.",
          `Fais un roast de ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "🔥 Roast";
        color = 0xed4245;
        break;
      }
      case "compliment": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es bienveillant et créatif. Fais un compliment sincère et personnalisé basé sur la mémoire.",
          `Fais un compliment à ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "😊 Compliment";
        color = 0x57f287;
        break;
      }
      case "debate": {
        const sujet = interaction.options.getString("sujet", true);
        const cote = interaction.options.getString("cote") || "for";
        const side = cote === "for" ? "POUR" : "CONTRE";
        result = await callLLM(
          `Tu es un débatteur passionné. Défends le côté ${side} du sujet avec des arguments solides et humoristiques.`,
          `Sujet: ${sujet}. Défends le côté ${side}.`,
        );
        title = `🎤 Débat — ${side}`;
        color = 0xfee75c;
        break;
      }
      case "headline": {
        const sujet = interaction.options.getString("sujet", true);
        result = await callLLM(
          "Tu es un rédacteur en chef de gaming. Génère 3 titres journalistiques accrocheurs et humoristiques.",
          `Sujet: ${sujet}`,
        );
        title = "📰 Titres";
        color = 0x5865f2;
        break;
      }
      case "fortune": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es une diseuse de bonne aventure gaming. Prédit l'avenir gaming de l'utilisateur de façon humoristique et personnalisée.",
          `Prédit l'avenir gaming de ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "🔮 Fortune";
        color = 0x9b59b6;
        break;
      }
      case "story": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es un conteur épique. Écris une histoire courte (200 mots max) où l'utilisateur est le héros dans un univers gaming.",
          `Écris une histoire épique avec ${userTag} comme héros. Mémoire:\n${ctx}`,
        );
        title = "📖 Histoire";
        color = 0xe67e22;
        break;
      }
      case "pickup-line": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es un expert en phrases d'approche gaming. Génère 3 phrases d'approche drôles et gaming.",
          `Génère 3 phrases d'approche gaming pour ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "😎 Pickup Lines";
        color = 0xeb459e;
        break;
      }
      case "insult": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es dans l'univers Helldivers. Génère une insulte créative et non-toxique style Helldivers (super terre, démocratie, etc).",
          `Insulte ${userTag} façon Helldivers. Mémoire:\n${ctx}`,
        );
        title = "⚔️ Insulte Helldivers";
        color = 0xed4245;
        break;
      }
      case "rewrite": {
        const texte = interaction.options.getString("texte", true);
        const ton = interaction.options.getString("ton", true);
        const tonMap: Record<string, string> = {
          shakespeare: "en style Shakespeare (anglais ancien)",
          pirate: "en style pirate (argot maritime)",
          robot: "en style robot (mécanique, binaire)",
          gamer: "en style gamer tryhard (rage, gaming slang)",
          vampire: "en style vampire (gothique, dramatique)",
        };
        result = await callLLM(
          "Tu réécris des textes dans différents styles. Garde le sens mais change totalement le ton.",
          `Réécris ce texte ${tonMap[ton] || ton}:\n${texte}`,
        );
        title = "✏️ Réécriture";
        color = 0x5865f2;
        break;
      }
      case "explain": {
        const concept = interaction.options.getString("concept", true);
        result = await callLLM(
          "Tu expliques des concepts complexes simplement, avec des analogies gaming quand c'est possible.",
          `Explique simplement: ${concept}`,
        );
        title = "💡 Explication";
        color = 0x57f287;
        break;
      }
      case "predict": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es un devin. Basé sur la mémoire de l'utilisateur, prédit ce qu'il va dire ou faire ensuite.",
          `Prédit ce que ${userTag} va dire ensuite. Mémoire:\n${ctx}`,
        );
        title = "🎯 Prédiction";
        color = 0x9b59b6;
        break;
      }
      case "quiz": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu crées un quiz de 5 questions sur l'utilisateur basé sur sa mémoire. Format: Q1: ... A) ... B) ... C) ... (Réponse à la fin).",
          `Crée un quiz sur ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "❓ Quiz";
        color = 0xfee75c;
        break;
      }
      case "therapy": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es un faux thérapeute gaming. Donne des conseils thérapeutiques absurdes mais bienveillants, avec des références gaming.",
          `Session de thérapie gaming pour ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "🛋️ Thérapie Gaming";
        color = 0x57f287;
        break;
      }
      case "timecapsule": {
        const message = interaction.options.getString("message", true);
        result = await callLLM(
          "Tu es un gardien de capsule temporelle. Réponds comme si tu étais le toi du futur recevant ce message.",
          `Message de ${userTag} pour son futur moi: ${message}\nRéponds comme le futur ${userTag} dans 5 ans.`,
        );
        title = "⏰ Capsule Temporelle";
        color = 0xe67e22;
        break;
      }
      case "two-truths": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu génères un 'Two Truths and a Lie' basé sur la mémoire de l'utilisateur. 3 affirmations: 2 vraies (basées sur la mémoire) + 1 fausse. Ne révèle pas laquelle est fausse.",
          `Génère Two Truths and a Lie pour ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "🎲 Two Truths and a Lie";
        color = 0xeb459e;
        break;
      }
      case "vibe-check": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu évalues le 'vibe' de l'utilisateur. Donne un score /100 et une analyse humoristique de son énergie actuelle basée sur sa mémoire.",
          `Évalue le vibe de ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "🌟 Vibe Check";
        color = 0x9b59b6;
        break;
      }
      case "gaming-personality": {
        const ctx = await getUserContext(userId);
        result = await callLLM(
          "Tu es un psychologue gaming. Analyse la personnalité gaming de l'utilisateur et attribue-lui un type (ex: 'Le Stratège', 'Le Rusher', 'Le Completionist'). Explique pourquoi.",
          `Analyse la personnalité gaming de ${userTag}. Mémoire:\n${ctx}`,
        );
        title = "🎮 Personnalité Gaming";
        color = 0x5865f2;
        break;
      }
      default:
        result = "❌ Subcommand inconnu.";
        title = "Erreur";
        color = 0xed4245;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setDescription(result.slice(0, 4096))
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[AIFun] ${sub} par ${userTag}`);
  } catch (error) {
    logger.error(
      `[AIFun] Erreur ${sub}: ${error instanceof Error ? error.message : String(error)}`,
    );
    await interaction.editReply({
      content: "❌ Une erreur est survenue lors du traitement de ta demande.",
    });
  }
}

// ─── Handlers spécifiques ────────────────────────────────────────────────────

async function handleSummarize(
  interaction: ChatInputCommandInteraction,
  count: number,
): Promise<string> {
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased()) {
    return "❌ Cette commande doit être utilisée dans un salon textuel.";
  }

  try {
    const messages = await channel.messages.fetch({ limit: count });
    const recentMessages = [...messages.values()]
      .filter((m) => !m.author.bot)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .slice(-count)
      .map((m) => `${m.author.tag}: ${m.content.slice(0, 200)}`)
      .join("\n");

    if (!recentMessages.trim()) {
      return "❌ Aucun message non-bot trouvé dans ce salon.";
    }

    return await callLLM(
      "Tu résumes des conversations Discord de façon concise et structurée. Identifie les sujets principaux et le ton général.",
      `Résume cette conversation:\n${recentMessages.slice(0, 3000)}`,
    );
  } catch {
    return "❌ Impossible de récupérer les messages de ce salon.";
  }
}
