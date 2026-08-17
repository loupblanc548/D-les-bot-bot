import logger from "../utils/logger.js";
import { config } from "../config.js";
import OpenAI from "openai";
import { chatWithHF } from "../utils/huggingFace.js";
import { chatWithGroq, isGroqAvailable } from "./groq.js";
import { chatWithGemini, isGeminiAvailable } from "./gemini.js";
import { chatWithLocalLlm, isLocalLlmAvailable } from "./localLlm.js";

let openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      baseURL: config.openRouterBaseUrl,
      // A placeholder keeps the OpenAI-compatible client constructible in local-only mode.
      apiKey: config.openRouterApiKey || "local-only",
      defaultHeaders: {
        "HTTP-Referer": "https://discord.com",
        "X-Title": "Discord Surveillance Bot",
      },
      timeout: config.aiTimeoutMs,
      // Retries are coordinated by the agent rotation, not duplicated by the SDK.
      maxRetries: 0,
    });
  }
  return openai;
}

export async function chatWithAI(message: string, username?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  const contextMessage = username
    ? `L'utilisateur Discord "${username}" dit : ${message}`
    : message;

  try {
    // ─── 1. Ollama local (no external key or quota) ──────────────────────────
    if (isLocalLlmAvailable()) {
      try {
        const localResponse = await chatWithLocalLlm(
          [
            { role: "system", content: config.aiSystemPrompt },
            { role: "user", content: contextMessage },
          ],
          { timeoutMs: Math.min(config.aiTimeoutMs, 20_000) },
        );
        if (localResponse) return localResponse;
      } catch (localErr) {
        logger.warn("[AI] LLM local échoué:", String(localErr));
      }
    }

    // ─── 2. Groq (ultra-fast, free, function calling) ───────────────────────
    if (isGroqAvailable()) {
      try {
        logger.info("[AI] Tentative Groq (priorité 1)...");
        const groqResponse = await chatWithGroq({
          systemPrompt: config.aiSystemPrompt,
          userMessage: contextMessage,
          maxTokens: 1000,
          temperature: 0.7,
        });
        if (groqResponse) return groqResponse;
      } catch (groqErr) {
        logger.error("[AI] Groq échoué:", String(groqErr));
      }
    }

    // ─── 3. Gemini (free, multimodal) ───────────────────────────────────────
    if (isGeminiAvailable()) {
      try {
        logger.warn("[AI] Tentative Gemini (priorité 2)...");
        const geminiResponse = await chatWithGemini(config.aiSystemPrompt, contextMessage, 1000);
        if (geminiResponse) return geminiResponse;
      } catch (geminiErr) {
        logger.error("[AI] Gemini échoué:", String(geminiErr));
      }
    }

    // ─── 4. Hugging Face (gratuit, open-source) ─────────────────────────────
    try {
      logger.warn("[AI] Tentative Hugging Face (priorité 3)...");
      const hfResponse = await chatWithHF(contextMessage, config.aiSystemPrompt);
      if (hfResponse) return hfResponse;
    } catch (hfErr) {
      logger.error("[AI] HuggingFace échoué:", String(hfErr));
    }

    // ─── 5. OpenRouter (modèle principal + rotation) ────────────────────────
    if (!config.openRouterApiKey) {
      return "❌ Aucun provider IA disponible. Démarre Ollama ou configure une API de secours.";
    }
    try {
      logger.warn("[AI] Tentative OpenRouter (priorité 4)...");
      const client = getOpenAIClient();
      const completion = await client.chat.completions.create(
        {
          model: config.openRouterModel,
          messages: [
            { role: "system", content: config.aiSystemPrompt },
            { role: "user", content: contextMessage },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        },
        { signal: controller.signal },
      );
      return (
        completion.choices[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse."
      );
    } catch (orErr) {
      logger.error("[AI] OpenRouter échoué:", String(orErr));
    }

    return "❌ Le service IA est temporairement indisponible. Réessayez plus tard.";
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleMention(message: string, authorName: string): Promise<string | null> {
  const mentionMatch = message.match(/^@(\S+)/);
  if (!mentionMatch) return null;
  const mentionedUser = mentionMatch[1];
  const cleanMessage = message.replace(/^@\S+\s*/, "");
  if (!cleanMessage) return null;
  return chatWithAI(`Tu t'adresses a @${mentionedUser}. ${cleanMessage}`, authorName);
}
