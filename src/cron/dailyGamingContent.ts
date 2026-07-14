/**
 * dailyGamingContent.ts — Contenu gaming quotidien généré par IA
 *
 * CRON-07: Daily challenge (défi gaming quotidien)
 * CRON-08: Gaming news digest (digest IA des news du jour)
 * CRON-18: Gaming trivia (question trivia gaming)
 *
 * Poste automatiquement dans le salon gaming configuré.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";

let cronJob: ScheduledTask | null = null;

const FOOTER = { text: "Contenu gaming automatique • IA" };

async function generateAIContent(prompt: string, maxTokens: number = 300): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "API IA non configurée.";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - Gaming Bot",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.2-3b-instruct:free",
        messages: [
          {
            role: "system",
            content:
              "Tu es John Helldiver, bot Discord gaming. Réponds en français, de manière concise et engageante. Utilise le formatage Discord (gras, listes).",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || "Génération échouée.";
  } catch (error) {
    logger.error("[DailyGaming] Erreur IA:", error);
    return "Génération échouée. Réessayez plus tard.";
  }
}

async function postDailyContent(client: Client): Promise<void> {
  // Poster dans le salon gaming dédié, PAS dans le salon log
  const channelId = process.env.GAMING_CHANNEL_ID || config.gamingBlogChannel || config.steamEpicChannel;
  if (!channelId) {
    logger.warn("[DailyGaming] Aucun salon gaming configuré — contenu ignoré");
    return;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) return;

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // ── Défi quotidien ──────────────────────────────────────────────
  const challenge = await generateAIContent(
    "Propose un défi gaming créatif pour aujourd'hui. Un seul défi, court et fun. Format: titre en gras + description sur 2-3 lignes.",
    200,
  );

  const challengeEmbed = new EmbedBuilder()
    .setTitle("🎯 Défi Gaming du Jour")
    .setColor(0x57f287)
    .setDescription(challenge.slice(0, 2000))
    .addFields({ name: "Date", value: today, inline: true })
    .setFooter(FOOTER)
    .setTimestamp();

  await (channel as TextChannel).send({ embeds: [challengeEmbed] }).catch(() => {});

  // ── Trivia ──────────────────────────────────────────────────────
  const trivia = await generateAIContent(
    "Pose une question trivia gaming (un seul QCM avec 4 options A/B/C/D). Ne donne PAS la réponse. Format: Question + 4 options.",
    200,
  );

  const triviaEmbed = new EmbedBuilder()
    .setTitle("🧠 Trivia Gaming")
    .setColor(0x3498db)
    .setDescription(trivia.slice(0, 2000))
    .setFooter({ text: "Réponds avec A, B, C ou D ! • " + FOOTER.text })
    .setTimestamp();

  await (channel as TextChannel).send({ embeds: [triviaEmbed] }).catch(() => {});

  logger.info("[DailyGaming] Contenu quotidien posté (défi + trivia)");
}

export function startDailyGamingContent(client: Client): void {
  if (cronJob) {
    logger.warn("[DailyGaming] Déjà actif — ignoré");
    return;
  }

  // Tous les jours à 12:00
  cronJob = cron.schedule("0 12 * * *", () => {
    postDailyContent(client).catch((err) => logger.error("[DailyGaming] Erreur cron:", err));
  });

  logger.info("[DailyGaming] Contenu quotidien planifié à 12:00 (défi + trivia)");
}

export function stopDailyGamingContent(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[DailyGaming] Cron arrêté");
  }
}
