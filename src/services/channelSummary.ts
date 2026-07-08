import type { OpenAI } from "openai";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";

/**
 * Service de résumé d'un fil de messages Discord.
 * - Limite le nombre de messages envoyés au modèle via `maxMessages` (par défaut : aucun cap).
 * - Prompt concis orienté "3-5 points clés".
 * - Timeout strict de 15 s via AbortController (le timeout par défaut du client est
 *   `config.aiTimeoutMs`, plus court — on le remplace pour absorber une conversation
 *   entière).
 * - En cas d'échec : renvoie la chaîne "Résumé indisponible".
 */

const SUMMARIZE_TIMEOUT_MS = 15_000;
const SUMMARIZE_MAX_TOKENS = 500;
const SUMMARIZE_TEMPERATURE = 0.3;

const FALLBACK_MESSAGE = "Résumé indisponible";

const SYSTEM_PROMPT =
  "Tu es un assistant spécialisé dans le résumé de conversations Discord. " +
  "Réponds uniquement en français, de manière claire, concise et neutre.";

const USER_PROMPT =
  "Résume ces messages Discord en 3-5 points clés. Sois concis.\n\n" +
  "Messages à résumer :\n";

/**
 *Résume un fil de messages Discord via OpenRouter.
 *
 * @param messages    Messages a fournir au modele (ordre chronologique preserve).
 * @param maxMessages Si defini, conserve uniquement les `maxMessages` derniers messages.
 */
export async function summarizeChannel(
  messages: string[],
  maxMessages?: number,
): Promise<string> {
  if (!Array.isArray(messages) || messages.length === 0) {
    return FALLBACK_MESSAGE;
  }

  const slice = typeof maxMessages === "number" && maxMessages > 0
    ? messages.slice(-maxMessages)
    : messages;

  // Filtre les chaines vides pour ne pas gonfler inutilement le prompt.
  const nonEmpty = slice.filter((m): m is string => typeof m === "string" && m.trim().length > 0);
  if (nonEmpty.length === 0) {
    return FALLBACK_MESSAGE;
  }

  const userMessage = USER_PROMPT + nonEmpty.map((m, i) => `${i + 1}. ${m}`).join("\n");

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), SUMMARIZE_TIMEOUT_MS);

  try {
    const client: OpenAI = getOpenAIClient();
    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: SUMMARIZE_MAX_TOKENS,
        temperature: SUMMARIZE_TEMPERATURE,
      },
      { signal: controller.signal },
    );

    const summary = completion.choices[0]?.message?.content?.trim();
    return summary && summary.length > 0 ? summary : FALLBACK_MESSAGE;
  } catch (error) {
    const reason =
      error instanceof Error
        ? (error.name === "AbortError" ? "timeout 15s" : error.message)
        : String(error);
    logger.warn(`[channelSummary] Echec du resume OpenRouter: ${reason}`);
    return FALLBACK_MESSAGE;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
