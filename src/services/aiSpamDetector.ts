/**
 * aiSpamDetector.ts — Détecte le spam avec embeddings (pas juste regex)
 *
 * Utilise OpenRouter pour analyser le contenu et déterminer si un message
 * est du spam (pub, scam, phishing, répétition excessive).
 *
 * Configuration .env:
 * - AI_SPAM_DETECTOR_ENABLED : "true" pour activer
 * - AI_SPAM_CHANNELS : liste d'IDs de salons séparés par virgules (vide = tous)
 */

import { Client, Message } from "discord.js";
import logger from "../utils/logger.js";

const ENABLED = process.env.AI_SPAM_DETECTOR_ENABLED === "true";
const CHANNEL_IDS = (process.env.AI_SPAM_CHANNELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SPAM_THRESHOLD = 0.8;
const userMessageHistory = new Map<string, { content: string; time: number }[]>();
const MAX_HISTORY = 5;
const REPEAT_THRESHOLD = 3;

function checkRepetition(userId: string, content: string): boolean {
  const history = userMessageHistory.get(userId) || [];
  const now = Date.now();
  const recent = history.filter((h) => now - h.time < 60_000);

  // Check for repeated identical/similar messages
  const similar = recent.filter((h) => {
    const similarity = calculateSimilarity(h.content, content);
    return similarity > 0.8;
  });

  recent.push({ content, time: now });
  userMessageHistory.set(userId, recent.slice(-MAX_HISTORY));

  return similar.length >= REPEAT_THRESHOLD;
}

function calculateSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

async function detectSpamWithAI(
  content: string,
): Promise<{ isSpam: boolean; confidence: number; reason: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { isSpam: false, confidence: 0, reason: "no API key" };

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.2-3b-instruct:free",
        messages: [
          {
            role: "system",
            content:
              'Analyze if this message is spam (advertising, scam, phishing, unwanted promotion). Respond with JSON: {"isSpam": boolean, "confidence": 0-1, "reason": "short explanation"}',
          },
          { role: "user", content: content.slice(0, 500) },
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return { isSpam: false, confidence: 0, reason: "API error" };
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content || "";

    try {
      const parsed = JSON.parse(text);
      return {
        isSpam: parsed.isSpam === true,
        confidence: Number(parsed.confidence) || 0,
        reason: String(parsed.reason || "unknown"),
      };
    } catch {
      return { isSpam: false, confidence: 0, reason: "parse error" };
    }
  } catch {
    return { isSpam: false, confidence: 0, reason: "fetch error" };
  }
}

export function startAiSpamDetector(client: Client): void {
  if (!ENABLED) {
    logger.info("[AiSpamDetector] Désactivé — AI_SPAM_DETECTOR_ENABLED non configuré");
    return;
  }

  logger.info(
    `[AiSpamDetector] Activé — surveillance ${CHANNEL_IDS.length > 0 ? CHANNEL_IDS.length + " salons" : "tous les salons"}`,
  );

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    if (CHANNEL_IDS.length > 0 && !CHANNEL_IDS.includes(message.channelId)) return;
    if (message.content.length < 5) return;

    // Quick repetition check (no API call)
    if (checkRepetition(message.author.id, message.content)) {
      try {
        await message.delete();
        if ("send" in message.channel) {
          await message.channel.send(`⚠️ ${message.author}, arrête de spammer !`);
        }
        logger.info(`[AiSpamDetector] Répétition détectée: ${message.author.tag}`);
      } catch {}
      return;
    }

    // AI-based spam detection for suspicious content
    const suspiciousPatterns =
      /(free|nitro|discord\.gift|steam\s*key|click\s*here|visit\s*my|check\s*out|promo|giveaway|claim\s*now)/i;
    if (!suspiciousPatterns.test(message.content)) return;

    const result = await detectSpamWithAI(message.content);
    if (result.isSpam && result.confidence >= SPAM_THRESHOLD) {
      try {
        await message.delete();
        if ("send" in message.channel) {
          await message.channel.send(
            `🚫 ${message.author}, message supprimé (spam détecté: ${result.reason})`,
          );
        }
        logger.info(
          `[AiSpamDetector] Spam supprimé: ${message.author.tag} — ${result.reason} (${result.confidence})`,
        );
      } catch {}
    }
  });
}
