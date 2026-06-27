/**
 * dramaPrediction.ts — Prédiction de drame en temps réel
 *
 * Intercepte les messages, maintient une fenêtre glissante de 50 messages
 * par salon dans Redis, analyse le sentiment en continu et alerte
 * instantanément l'owner si le score de tension franchit un seuil critique.
 *
 * Alertes parallèles : DM owner + message dans le salon de logs,
 * avec ping explicite <@ownerId> et embed structuré.
 */

import { Client, Message, EmbedBuilder, TextChannel } from "discord.js";
import * as Sentry from "@sentry/node";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import { setCache, getCache } from "../utils/redis.js";

const REDIS_KEY_PREFIX = "drama:channel:";
const WINDOW_SIZE = 50;
const WINDOW_TTL_SECONDS = 3600; // 1h
const ALERT_COOLDOWN_SECONDS = 300; // 5 min entre alertes par salon
const TENSION_THRESHOLD = 70; // /100
const MIN_MESSAGES_FOR_ANALYSIS = 10;

interface MessageMetadata {
  userId: string;
  username: string;
  content: string;
  sentiment: "positive" | "neutral" | "negative";
  anger: number;
  toxicity: number;
  timestamp: number;
}

interface ChannelTensionState {
  messages: MessageMetadata[];
  lastAlertAt: number;
}

/**
 * Analyse rapide de sentiment/toxicité d'un message.
 * Utilise une heuristique locale (pas d'appel API pour garantir le temps réel).
 */
function quickAnalyzeMessage(content: string): {
  sentiment: "positive" | "neutral" | "negative";
  anger: number;
  toxicity: number;
} {
  const lower = content.toLowerCase();

  // Mots indicateurs de colère / toxicité
  const angerWords = [
    "pute",
    "merde",
    "connard",
    "salope",
    "enculé",
    "nique",
    "fdp",
    "tg",
    "ferme",
    "idiot",
    "crétin",
    "débile",
    "abruti",
    "bouffon",
    "clown",
    "nul",
    "casé",
    "ntm",
    "stfu",
    "trash",
    "cancer",
    "chier",
    "emmerde",
  ];
  const sarcasmWords = ["ah ok", "bravo", "génial", "super", "wow", "j'adore", "bien joué", "gg"];
  const positiveWords = ["merci", "gg", "bien joué", "joli", "super", "génial", "parfait", "top"];

  let anger = 0;
  let toxicity = 0;

  for (const word of angerWords) {
    if (lower.includes(word)) {
      anger += 15;
      toxicity += 20;
    }
  }

  for (const word of sarcasmWords) {
    if (lower.includes(word)) {
      anger += 5;
    }
  }

  let positiveScore = 0;
  for (const word of positiveWords) {
    if (lower.includes(word)) positiveScore += 10;
  }

  // Caps lock = colère
  const capsRatio =
    content.length > 10 ? (content.match(/[A-Z]/g)?.length ?? 0) / content.length : 0;
  if (capsRatio > 0.5) anger += 15;

  // Répétition de ponctuation !!! ???
  if (/[!?]{3,}/.test(content)) anger += 10;

  // Mentions répétées @everyone @here
  if (/@(everyone|here)/.test(lower)) toxicity += 15;

  anger = Math.min(100, anger);
  toxicity = Math.min(100, toxicity - positiveScore);

  const sentiment: "positive" | "neutral" | "negative" =
    toxicity > 20 ? "negative" : positiveScore > toxicity ? "positive" : "neutral";

  return { sentiment, anger, toxicity: Math.max(0, toxicity) };
}

/**
 * Calcule le score de tension d'un salon à partir des messages en buffer.
 */
function calculateTensionScore(messages: MessageMetadata[]): {
  score: number;
  involvedUsers: string[];
  topMessages: MessageMetadata[];
} {
  if (messages.length < MIN_MESSAGES_FOR_ANALYSIS) {
    return { score: 0, involvedUsers: [], topMessages: [] };
  }

  const recentMessages = messages.slice(-WINDOW_SIZE);

  // Score moyen de toxicité
  const avgToxicity =
    recentMessages.reduce((sum, m) => sum + m.toxicity, 0) / recentMessages.length;
  const avgAnger = recentMessages.reduce((sum, m) => sum + m.anger, 0) / recentMessages.length;

  // Ratio de messages négatifs
  const negativeCount = recentMessages.filter((m) => m.sentiment === "negative").length;
  const negativeRatio = negativeCount / recentMessages.length;

  // Détection de conflit entre utilisateurs spécifiques (aller-retour agressif)
  const userTensionMap = new Map<string, number>();
  for (let i = 1; i < recentMessages.length; i++) {
    const prev = recentMessages[i - 1];
    const curr = recentMessages[i];
    if (prev.userId !== curr.userId && curr.toxicity > 30 && prev.toxicity > 30) {
      const pair = [prev.userId, curr.userId].sort().join("+");
      userTensionMap.set(pair, (userTensionMap.get(pair) ?? 0) + 25);
    }
  }

  const maxUserTension = Math.max(0, ...userTensionMap.values());

  // Score composite
  const score = Math.min(
    100,
    Math.round(
      avgToxicity * 0.35 + avgAnger * 0.25 + negativeRatio * 100 * 0.2 + maxUserTension * 0.2,
    ),
  );

  // Utilisateurs impliqués dans la tension
  const involvedUsers = [...userTensionMap.entries()]
    .filter(([, v]) => v > 20)
    .flatMap(([k]) => k.split("+"))
    .filter((v, i, a) => a.indexOf(v) === i);

  // Top messages les plus toxiques
  const topMessages = [...recentMessages].sort((a, b) => b.toxicity - a.toxicity).slice(0, 5);

  return { score, involvedUsers, topMessages };
}

/**
 * Génère un résumé IA succinct du conflit potentiel.
 */
async function generateConflictSummary(
  messages: MessageMetadata[],
  channelName: string,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "Analyse IA indisponible";

  const sampleText = messages
    .slice(-15)
    .map((m) => `${m.username}: ${m.content.slice(0, 100)}`)
    .join("\n");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - Drama Prediction",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
        messages: [
          {
            role: "system",
            content:
              "Tu es un modérateur IA. Résume en 2-3 phrases maximum le sujet et la source du conflit potentiel dans ce salon. Sois factuel et neutre. Pas de markdown.",
          },
          {
            role: "user",
            content: `Salon: #${channelName}\nMessages récents:\n${sampleText}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return "Analyse IA indisponible";
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || "Analyse IA indisponible";
  } catch {
    return "Analyse IA indisponible";
  }
}

/**
 * Envoie les alertes (DM owner + salon de logs) en parallèle.
 */
async function sendDramaAlert(
  client: Client,
  channelId: string,
  channelName: string,
  guildName: string,
  tensionScore: number,
  involvedUsers: string[],
  topMessages: MessageMetadata[],
  summary: string,
): Promise<void> {
  const ownerId = config.ownerId;
  if (!ownerId) {
    logger.warn("[DramaPrediction] OWNER_ID non configuré — alerte perdue");
    return;
  }

  const userMentions = involvedUsers.map((id) => `<@${id}>`).join(", ") || "Multiple utilisateurs";
  const messageSamples = topMessages
    .map((m) => `**${m.username}** (tox:${m.toxicity}): ${m.content.slice(0, 80)}`)
    .join("\n")
    .slice(0, 1024);

  const embed = new EmbedBuilder()
    .setColor(0xff3344)
    .setTitle("🚨 ALERTE DRAME — Surchauffe détectée")
    .setDescription(`<@${ownerId}> **Intervention requise !**`)
    .addFields(
      { name: "📍 Salon", value: `#${channelName} (${guildName})`, inline: true },
      { name: "🔥 Score de tension", value: `${tensionScore}/100`, inline: true },
      { name: "👥 Utilisateurs impliqués", value: userMentions, inline: false },
      { name: "📝 Résumé IA", value: summary, inline: false },
      { name: "💬 Messages les plus toxiques", value: messageSamples || "N/A", inline: false },
    )
    .setFooter({ text: "Drama Prediction System • Temps réel" })
    .setTimestamp();

  const logChannelId = process.env.LOG_CHANNEL_ID || config.twitterChannel;
  const tasks: Promise<unknown>[] = [];

  // 1. DM to owner
  tasks.push(
    (async () => {
      try {
        const owner = await client.users.fetch(ownerId);
        await owner.send({ content: `<@${ownerId}>`, embeds: [embed] });
        logger.info(`[DramaPrediction] DM envoyé à l'owner pour #${channelName}`);
      } catch (err) {
        logger.warn(
          `[DramaPrediction] DM owner échoué (DMs fermés ?): ${err instanceof Error ? err.message : String(err)} — fallback logs uniquement`,
        );
      }
    })(),
  );

  // 2. Alert in log channel
  if (logChannelId) {
    tasks.push(
      (async () => {
        try {
          const logChannel = (await client.channels.fetch(logChannelId)) as TextChannel | null;
          if (logChannel && logChannel.isTextBased()) {
            await logChannel.send({ content: `<@${ownerId}>`, embeds: [embed] });
            logger.info(
              `[DramaPrediction] Alerte envoyée dans le salon de logs pour #${channelName}`,
            );
          }
        } catch (err) {
          logger.warn(
            `[DramaPrediction] Salon de logs inaccessible: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      })(),
    );
  }

  await Promise.allSettled(tasks);
}

/**
 * Traite un message entrant pour la prédiction de drame.
 */
export async function processMessageForDrama(message: Message): Promise<void> {
  if (message.author.bot || !message.guild || !message.channelId) return;

  const channelId = message.channelId;
  const redisKey = `${REDIS_KEY_PREFIX}${channelId}`;

  try {
    // Récupérer l'état actuel du salon depuis Redis
    const state = await getCache<ChannelTensionState>(redisKey);
    const messages = state?.messages ?? [];
    const lastAlertAt = state?.lastAlertAt ?? 0;

    // Analyser le nouveau message
    const analysis = quickAnalyzeMessage(message.content);
    const newEntry: MessageMetadata = {
      userId: message.author.id,
      username: message.author.username,
      content: message.content,
      sentiment: analysis.sentiment,
      anger: analysis.anger,
      toxicity: analysis.toxicity,
      timestamp: Date.now(),
    };

    // Ajouter à la fenêtre glissante
    messages.push(newEntry);
    if (messages.length > WINDOW_SIZE) {
      messages.splice(0, messages.length - WINDOW_SIZE);
    }

    // Calculer le score de tension
    const { score, involvedUsers, topMessages } = calculateTensionScore(messages);

    // Sauvegarder dans Redis
    await setCache(redisKey, { messages, lastAlertAt }, WINDOW_TTL_SECONDS);

    // Vérifier si on doit alerter
    if (score >= TENSION_THRESHOLD) {
      const now = Date.now();
      const cooldownMs = ALERT_COOLDOWN_SECONDS * 1000;

      if (now - lastAlertAt < cooldownMs) {
        return; // Cooldown actif
      }

      // Mettre à jour le timestamp d'alerte
      await setCache(redisKey, { messages, lastAlertAt: now }, WINDOW_TTL_SECONDS);

      const channelName = (message.channel as { name?: string }).name ?? "inconnu";
      const guildName = message.guild.name ?? "inconnu";

      logger.warn(
        `[DramaPrediction] 🚨 Tension critique (${score}/100) dans #${channelName} (${guildName})`,
      );

      // Générer le résumé IA + envoyer l'alerte en parallèle
      const summary = await generateConflictSummary(messages, channelName).catch(
        () => "Analyse IA indisponible",
      );

      await sendDramaAlert(
        message.client,
        channelId,
        channelName,
        guildName,
        score,
        involvedUsers,
        topMessages,
        summary,
      );
    }
  } catch (err) {
    logger.error(
      `[DramaPrediction] Erreur traitement message: ${err instanceof Error ? err.message : String(err)}`,
    );
    Sentry.captureException(err, { tags: { module: "dramaPrediction", channelId } });
  }
}

/**
 * Attache le listener d'événements messageCreate au client.
 */
export function attachDramaPrediction(client: Client): void {
  client.on("messageCreate", (message) => {
    // Non-bloquant : fire and forget
    void processMessageForDrama(message);
  });

  logger.info("[DramaPrediction] Système de prédiction de drame activé (temps réel)");
}
