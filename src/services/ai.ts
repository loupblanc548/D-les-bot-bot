import logger from "../utils/logger.js";
import { config } from "../config.js";
import OpenAI from "openai";

let openai: OpenAI | null = null;

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

export async function chatWithAI(message: string, username?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  try {
    const client = getOpenAIClient();
    const contextMessage = username
      ? `L'utilisateur Discord "${username}" dit : ${message}`
      : message;
    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        { role: "system", content: config.aiSystemPrompt },
        { role: "user", content: contextMessage },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }, { signal: controller.signal });
    return completion.choices[0]?.message?.content || "Desole, je n'ai pas pu generer de reponse.";
  } catch (error) {
    logger.error("OpenRouter API error:", String(error));
    if ((error as Error).name === "AbortError") {
      return "❌ La reponse de l'IA a pris trop de temps. Reessayez.";
    }
    return "❌ Erreur lors de la communication avec l'IA.";
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
