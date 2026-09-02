import { Client, Message, EmbedBuilder, TextChannel, DMChannel } from "discord.js";
import logger from "../../utils/logger.js";
import { ensureConnected } from "../../utils/redisClient.js";
import {
  buildPersonalitySystemPrompt,
  DEFAULT_OPERATING_PROMPT,
} from "../../infrastructure/middleware/personalityMiddleware.js";

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

    const systemPrompt = buildPersonalitySystemPrompt(
      process.env.AI_SYSTEM_PROMPT || DEFAULT_OPERATING_PROMPT,
    );

    const { respondChat, recoverChatReply } = await import("../../services/chatResponder.js");
    const { isErrorResponse } = await import("../../services/responseClassifier.js");
    const chatHistory = context
      .slice(0, -1)
      .filter((m): m is MessageContext & { role: "user" | "assistant" } => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const userMessage = context[context.length - 1]?.content ?? message.content;
    const result = await respondChat(userMessage, chatHistory, {
      systemPrompt,
      userId,
      guildId: message.guildId ?? undefined,
      maxTokens: 1000,
      deadlineMs: 20_000,
    });
    let response = result.content;
    if (!response || result.provider === "fallback" || isErrorResponse(response)) {
      response = await recoverChatReply(response || "", userMessage, {
        systemPrompt,
        userId,
        guildId: message.guildId ?? undefined,
        maxTokens: 1000,
        deadlineMs: 20_000,
      });
    }
    if (response) {
      context.push({ role: "assistant", content: response });

      if (context.length > MAX_MESSAGES) {
        context.shift();
      }

      await saveContext(contextKey, context);

      const embed = new EmbedBuilder()
        .setTitle("John")
        .setDescription(response)
        .setColor(0xffd700)
        .setFooter({ text: "IA généraliste" })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error("[AIChat] Error:", error);
    try {
      const { noteUnansweredQuestion } = await import("../../services/chatResponder.js");
      const { FALLBACK_MESSAGE } = await import("../../services/responseClassifier.js");
      noteUnansweredQuestion(message.author.id, message.content);
      await message.reply({ content: FALLBACK_MESSAGE });
    } catch {
      await message.reply({
        content:
          "Les canaux IA sont saturés là. Envoie **go** et je relance, sans que tu aies à retaper.",
      });
    }
  }
}

async function getContext(key: string): Promise<MessageContext[]> {
  try {
    const redis = await ensureConnected();
    if (!redis) return [];
    const data = await redis.get(key);
    return data ? (JSON.parse(data as string) as MessageContext[]) : [];
  } catch (error) {
    logger.error("[AIChat] Error getting context:", error);
    return [];
  }
}

async function saveContext(key: string, context: MessageContext[]): Promise<void> {
  try {
    const redis = await ensureConnected();
    if (!redis) return;
    await redis.set(key, JSON.stringify(context), { EX: CONTEXT_TTL });
  } catch (error) {
    logger.error("[AIChat] Error saving context:", error);
  }
}

function estimateTokens(context: MessageContext[]): number {
  return context.reduce((total, msg) => total + msg.content.length, 0);
}
