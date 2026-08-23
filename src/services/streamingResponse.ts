/**
 * streamingResponse.ts — Streaming des réponses IA sur Discord
 *
 * Simule l'effet "token par token" de ChatGPT en éditant progressivement
 * un message Discord pendant que le LLM génère (stream: true via OpenRouter).
 *
 * Contraintes Discord: max ~5 éditions/5s par message → on édite toutes les 1.5s.
 */

import { Message } from "discord.js";
import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";

const EDIT_INTERVAL_MS = 400;
const MAX_DISCORD_LENGTH = 2000;
const CURSOR = " ▌";

export interface StreamOptions {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Génère une réponse en streaming et l'affiche progressivement
 * en éditant un message Discord.
 *
 * @param replyTo Le message utilisateur auquel répondre
 * @param options Options du LLM
 * @returns Le texte final complet
 */
export async function streamToDiscord(replyTo: Message, options: StreamOptions): Promise<string> {
  const client = getOpenAIClient();
  let statusMessage: Message | null = null;
  let accumulated = "";
  let lastEdit = 0;
  let editing = false;

  try {
    statusMessage = await replyTo.reply("💭 ...");
  } catch {
    statusMessage = null;
  }

  const flushEdit = async (final = false): Promise<void> => {
    if (!statusMessage || editing) return;
    const now = Date.now();
    if (!final && now - lastEdit < EDIT_INTERVAL_MS) return;
    editing = true;
    lastEdit = now;
    try {
      const display = final ? accumulated : accumulated + CURSOR;
      await statusMessage.edit(display.slice(0, MAX_DISCORD_LENGTH));
    } catch {
      logger.error("[Silent catch]");
    } finally {
      editing = false;
    }
  };

  try {
    const stream = await client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        accumulated += delta;
        void flushEdit();
      }
    }

    await flushEdit(true);
    logger.info(`[Streaming] Réponse streamée (${accumulated.length} chars)`);
    return accumulated;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[Streaming] Échec du streaming: ${errMsg} — fallback non-stream`);

    // Fallback: non-streaming call
    try {
      const completion = await client.chat.completions.create({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
      });
      accumulated = completion.choices[0]?.message?.content ?? "";
      if (statusMessage && accumulated) {
        await statusMessage.edit(accumulated.slice(0, MAX_DISCORD_LENGTH)).catch(() => {});
      }
      return accumulated;
    } catch (fallbackErr) {
      logger.error(
        `[Streaming] Fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
      );
      if (statusMessage) {
        await statusMessage.edit("❌ Erreur lors de la génération de la réponse.").catch(() => {});
      }
      return "";
    }
  }
}

/**
 * Variante: streame la réponse finale d'un agent loop déjà exécuté.
 * Découpe le texte en morceaux et simule le streaming (utile quand la
 * réponse vient d'un agent loop non-streamable).
 */
export async function simulateStreamEdit(statusMessage: Message, fullText: string): Promise<void> {
  const text = fullText.slice(0, MAX_DISCORD_LENGTH);
  const chunkSize = Math.max(200, Math.ceil(text.length / 2));
  let shown = 0;

  while (shown < text.length) {
    shown = Math.min(shown + chunkSize, text.length);
    const partial = shown < text.length ? text.slice(0, shown) + CURSOR : text;
    try {
      await statusMessage.edit(partial);
    } catch {
      return; // Message deleted or rate-limited
    }
    if (shown < text.length) {
      await new Promise((r) => setTimeout(r, EDIT_INTERVAL_MS));
    }
  }
}
