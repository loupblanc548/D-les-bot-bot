import logger from "../utils/logger.js";
import { config } from "../config.js";
import OpenAI from "openai";
import { respondChat } from "./chatResponder.js";

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
  const contextMessage = username
    ? `L'utilisateur Discord "${username}" dit : ${message}`
    : message;

  const result = await respondChat(contextMessage, [], {
    maxTokens: 1000,
    temperature: 0.7,
    deadlineMs: config.aiTimeoutMs,
  });
  if (result.provider === "fallback") {
    logger.warn("[AI] Tous les providers ont échoué — réponse de repli conversationnelle");
  }
  return result.content;
}

export async function handleMention(message: string, authorName: string): Promise<string | null> {
  const mentionMatch = message.match(/^@(\S+)/);
  if (!mentionMatch) return null;
  const mentionedUser = mentionMatch[1];
  const cleanMessage = message.replace(/^@\S+\s*/, "");
  if (!cleanMessage) return null;
  return chatWithAI(`Tu t'adresses a @${mentionedUser}. ${cleanMessage}`, authorName);
}
