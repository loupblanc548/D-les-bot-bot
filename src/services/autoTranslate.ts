/**
 * autoTranslate.ts — Détecte et traduit automatiquement les messages
 * non-français dans les salons configurés.
 *
 * Configuration .env:
 * - AUTO_TRANSLATE_CHANNELS : liste d'IDs de salons séparés par virgules
 * - AUTO_TRANSLATE_ENABLED : "true" pour activer
 */

import { Client, Message } from "discord.js";
import logger from "../utils/logger.js";

const ENABLED = process.env.AUTO_TRANSLATE_ENABLED === "true";
const CHANNEL_IDS = (process.env.AUTO_TRANSLATE_CHANNELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Simple language detection based on common words/patterns
const LANG_PATTERNS: Record<string, RegExp> = {
  en: /\b(the|and|is|are|you|hello|what|this|that|with|have|for|not|can|will)\b/i,
  es: /\b(el|la|los|las|que|de|en|y|es|son|hola|que|esto|eso|con|para|no|puede)\b/i,
  de: /\b(der|die|das|und|ist|sind|du|hallo|was|dies|das|mit|haben|für|nicht|kann)\b/i,
  it: /\b(il|la|che|di|in|e|sono|ciao|cosa|questo|quello|con|per|non|può)\b/i,
  pt: /\b(o|a|que|de|em|e|são|olá|isso|isto|com|para|não|pode)\b/i,
  ru: /[\u0400-\u04FF]/,
  ja: /[\u3040-\u309F\u30A0-\u30FF]/,
  ko: /[\uAC00-\uD7AF]/,
  zh: /[\u4E00-\u9FFF]/,
  ar: /[\u0600-\u06FF]/,
};

function detectLanguage(text: string): string | null {
  for (const [lang, pattern] of Object.entries(LANG_PATTERNS)) {
    if (pattern.test(text)) return lang;
  }
  return null;
}

// Translation via OpenRouter (free model)
async function translateText(text: string, fromLang: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

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
            content: `Translate the following ${fromLang} text to French. Only output the translation, nothing else.`,
          },
          { role: "user", content: text.slice(0, 1000) },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export function startAutoTranslate(client: Client): void {
  if (!ENABLED || CHANNEL_IDS.length === 0) {
    logger.info(
      "[AutoTranslate] Désactivé — AUTO_TRANSLATE_ENABLED ou AUTO_TRANSLATE_CHANNELS non configuré",
    );
    return;
  }

  logger.info(`[AutoTranslate] Activé — ${CHANNEL_IDS.length} salon(s) surveillé(s)`);

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    if (!CHANNEL_IDS.includes(message.channelId)) return;
    if (message.content.length < 10) return;

    const lang = detectLanguage(message.content);
    if (!lang || lang === "fr") return;

    const translation = await translateText(message.content, lang);
    if (!translation) return;

    try {
      await message.reply({
        content: `🌐 **Traduction (${lang} → fr):**\n> ${translation}`,
        allowedMentions: { repliedUser: false },
      });
    } catch (err) {
      logger.debug(
        `[AutoTranslate] Erreur reply: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}
