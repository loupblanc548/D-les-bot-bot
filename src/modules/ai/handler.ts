import { Client, Message, EmbedBuilder, TextChannel, DMChannel } from "discord.js";
import logger from "../../utils/logger.js";
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redis.on("error", (err: Error) => logger.error("[Redis] Error:", err));
redis.connect().catch((err) => logger.error("[Redis] Connect error:", err));
const CONTEXT_KEY_PREFIX = "ai:context:";
const CONTEXT_TTL = 15 * 60; // 15 minutes
const MAX_MESSAGES = 8;
const MAX_TOKENS = 4000;

interface MessageContext {
  role: string;
  content: string;
}

export async function handleAIChat(client: Client, message: Message): Promise<void> {
  try {
    if (!message.content || message.author.bot) return;

    const userId = message.author.id;
    const channelId = message.channelId;
    const contextKey = `${CONTEXT_KEY_PREFIX}${channelId}:${userId}`;

    if (message.channel instanceof TextChannel || message.channel instanceof DMChannel) {
      await message.channel.sendTyping();
    }

    const context = await getContext(contextKey);
    context.push({ role: "user", content: message.content });

    if (context.length > MAX_MESSAGES) {
      context.shift();
    }

    const estimatedTokens = estimateTokens(context);
    if (estimatedTokens > MAX_TOKENS) {
      while (context.length > 2 && estimateTokens(context) > MAX_TOKENS) {
        context.shift();
      }
    }

    const systemPrompt =
      process.env.AI_SYSTEM_PROMPT || "Tu es un assistant utile et concis. Réponds en français.";
    const model = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";

    const response = await fetchOpenRouter(context, systemPrompt, model);

    if (response) {
      context.push({ role: "assistant", content: response });

      if (context.length > MAX_MESSAGES) {
        context.shift();
      }

      await saveContext(contextKey, context);

      const embed = new EmbedBuilder()
        .setTitle("🤖 JOHN HELLDIVER AI")
        .setDescription(response)
        .setColor(0xffd700)
        .setFooter({ text: "Super Earth Command • AI System" })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error("[AIChat] Error:", error);
    await message.reply({
      content: "❌ Erreur lors du traitement de votre message",
    });
  }
}

async function getContext(key: string): Promise<MessageContext[]> {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    logger.error("[AIChat] Error getting context:", error);
    return [];
  }
}

async function saveContext(key: string, context: MessageContext[]): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(context), { EX: CONTEXT_TTL });
  } catch (error) {
    logger.error("[AIChat] Error saving context:", error);
  }
}

function estimateTokens(context: MessageContext[]): number {
  return context.reduce((total, msg) => total + msg.content.length, 0);
}

async function fetchOpenRouter(
  context: MessageContext[],
  systemPrompt: string,
  model: string,
): Promise<string> {
  try {
    const messages = [{ role: "system", content: systemPrompt }, ...context];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.choices[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse.";
  } catch (error) {
    logger.error("[AIChat] OpenRouter error:", error);
    return "Désolé, une erreur s'est produite lors de la communication avec l'IA.";
  }
}
