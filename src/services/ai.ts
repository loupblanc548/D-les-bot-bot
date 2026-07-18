import logger from "../utils/logger.js";
import { config } from "../config.js";
import OpenAI from "openai";
import { chatWithHF } from "../utils/huggingFace.js";
import { chatWithGroq, isGroqAvailable } from "./groq.js";
import { chatWithGemini, isGeminiAvailable } from "./gemini.js";

let openai: OpenAI | null = null;
let openaiPremium: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      baseURL: config.openRouterBaseUrl,
      apiKey: config.openRouterApiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://discord.com",
        "X-Title": "Discord Surveillance Bot",
      },
      timeout: config.aiTimeoutMs,
      maxRetries: 2,
    });
  }
  return openai;
}

export function getOpenAIPremiumClient(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (!openaiPremium) {
    openaiPremium = new OpenAI({
      apiKey: config.openaiApiKey,
      timeout: config.aiTimeoutMs,
      maxRetries: 2,
    });
    logger.info("[AI] ✅ OpenAI premium client initialized (gpt-4o-mini, gpt-4o)");
  }
  return openaiPremium;
}

export function isOpenAIPremiumAvailable(): boolean {
  return !!config.openaiApiKey;
}

export async function chatWithAI(message: string, username?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  const contextMessage = username
    ? `L'utilisateur Discord "${username}" dit : ${message}`
    : message;
  try {
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
    return completion.choices[0]?.message?.content || "Desole, je n'ai pas pu generer de reponse.";
  } catch (error) {
    logger.error("OpenRouter API error:", String(error));
    if ((error as Error).name === "AbortError") {
      // Try Groq as fast fallback before giving up
    }

    // Fallback 0: OpenAI premium (if API key configured)
    if (isOpenAIPremiumAvailable()) {
      try {
        logger.warn("[AI] Tentative de fallback OpenAI premium...");
        const premiumClient = getOpenAIPremiumClient()!;
        const completion = await premiumClient.chat.completions.create({
          model: config.openaiModel,
          messages: [
            { role: "system", content: config.aiSystemPrompt },
            { role: "user", content: contextMessage },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        });
        return (
          completion.choices[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse."
        );
      } catch (openaiErr) {
        logger.error("[AI] OpenAI premium échoué:", String(openaiErr));
      }
    }

    // Fallback 1: Groq (ultra-fast, free)
    if (isGroqAvailable()) {
      try {
        logger.warn("[AI] Tentative de fallback Groq...");
        const groqResponse = await chatWithGroq({
          systemPrompt: config.aiSystemPrompt,
          userMessage: contextMessage,
          maxTokens: 800,
          temperature: 0.7,
        });
        if (groqResponse) return groqResponse;
      } catch (groqErr) {
        logger.error("[AI] Groq fallback échoué:", String(groqErr));
      }
    }

    // Fallback 2: Gemini (free, multimodal)
    if (isGeminiAvailable()) {
      try {
        logger.warn("[AI] Tentative de fallback Gemini...");
        const geminiResponse = await chatWithGemini(config.aiSystemPrompt, contextMessage, 800);
        if (geminiResponse) return geminiResponse;
      } catch (geminiErr) {
        logger.error("[AI] Gemini fallback échoué:", String(geminiErr));
      }
    }

    // Fallback 3: OpenRouter with lighter model
    try {
      logger.warn("[AI] Tentative de fallback avec modele leger...");
      const client = getOpenAIClient();
      const fallbackModel = "openai/gpt-4o-mini";
      const completion = await client.chat.completions.create({
        model: fallbackModel,
        messages: [
          { role: "system", content: config.aiSystemPrompt },
          { role: "user", content: contextMessage },
        ],
        max_tokens: 500,
        temperature: 0.5,
      });
      return completion.choices[0]?.message?.content || "❌ L'IA n'a pas pu repondre.";
    } catch (fallbackErr) {
      logger.error("[AI] Fallback aussi en echec:", String(fallbackErr));

      // Fallback ultime: Hugging Face (gratuit, open-source)
      try {
        logger.warn("[AI] Tentative de fallback Hugging Face...");
        const hfResponse = await chatWithHF(contextMessage, config.aiSystemPrompt);
        if (hfResponse) return hfResponse;
      } catch (hfErr) {
        logger.error("[AI] HuggingFace aussi en echec:", String(hfErr));
      }

      return "❌ Le service IA est temporairement indisponible. Reessayez plus tard.";
    }
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
