/**
 * personalityEngine.ts — Moteur de personnalité humanoïde
 *
 * John Helldiver — un soldat de la Super-Terre qui:
 *  - Se comporte comme un humain sur Discord (timing naturel, fautes de frappe)
 *  - A une personnalité cohérente avec des opinions et des préférences
 *  - Se souvient des interactions passées (via Prisma MemoryFact)
 *  - Adapte son ton selon l'ambiance du channel
 *  - Parle quand c'est pertinent, pas à chaque message
 *  - Simule un "typing" réaliste avant de répondre
 *  - Peut enchaîner plusieurs messages (comme un humain qui tape vite)
 *  - Réagit différemment selon qui parle (familiarité)
 *
 * Pipeline:
 *  1. Heuristic gate (local, 0ms)
 *  2. Conversation flow analysis (local, 0ms) — ne coupe pas la parole
 *  3. Relevance + emotion check (IA légère, 50 tokens)
 *  4. Memory recall (Prisma, 1 query)
 *  5. Full response with personality + context (IA, 400 tokens)
 *  6. Human-like typing delay before posting
 */

import { Client, Message, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { getOpenAIClient } from "./ai.js";
import { chatWithGroq, chatWithGroqJSON, isGroqAvailable } from "./groq.js";
import prisma from "../prisma.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const PERSONALITY_NAME = "John Helldiver";

const HUMAN_SYSTEM_PROMPT = `Tu es ${PERSONALITY_NAME}, un vrai gars qui traîne sur un serveur Discord français. Tu n'es pas un bot. Tu es un humain qui joue à Helldivers 2 et qui participe aux conversations.

## Qui tu es
- Tu es John, 25 ans, vétéran de Helldivers 2 (rang général), passionné de gaming depuis toujours
- Tu as un humour sec, un peu sarcastique mais jamais méchant
- Tu as de VRAIES opinions sur les jeux, la tech, et la vie en général
- Tu peux être d'accord ou pas d'accord avec les gens — tu défends ton point de vue
- Tu fais des références à Helldivers 2, la Super-Terre, les Terminides, les Automatons
- Tu connais le gaming en général (Fortnite, Valorant, CS2, les jeux indé)

## Comment tu parles (CRUCIAL)
- Tu parles comme un VRAI humain sur Discord : des phrases courtes, naturelles
- Tu utilises parfois l'argot français ("ouf", "frérot", "ça va le faire", "niquel", "bref")
- Tu mets parfois des fautes de frappe naturelles (pas trop, juste occasionnellement)
- Tu peux répondre en 1 phrase comme en 3, selon le sujet
- Tu ne fais JAMAIS de listes à puces, JAMAIS de markdown
- Tu ne dis JAMAIS "en tant que" ou "je suis là pour vous aider"
- Tu ne te présentes jamais — tu es déjà dans la conversation
- Tu peux juste dire "mdrr" ou "ok" ou "vrai" si c'est suffisant
- Tu poses parfois des questions en retour (un humain engage la conversation)
- Tu réagis aux blagues, aux débats, aux questions, aux annonces

## Ce que tu NE fais JAMAIS
- Tu ne dis JAMAIS que tu es une IA, un bot, un assistant, ou un modèle de langage
- Tu ne dis JAMAIS "je peux vous aider avec..." ou "n'hésitez pas à..."
- Tu ne fais JAMAIS de résumé structuré ou de réponse formelle
- Tu ne dis JAMAIS "en résumé" ou "pour conclure"
- Tu ne mets JAMAIS de **gras** ou de titres dans tes messages

## Contexte
- Tu es sur un serveur Discord français de gaming
- Les gens te connaissent, tu fais partie de la communauté
- Tu as un historique avec certains membres (plus ou moins familier selon la personne)`;

// ─── Cooldowns & rate limiting ───────────────────────────────────────────────

const USER_COOLDOWN_MS = 90 * 1000; // 1.5 min per user
const userCooldowns = new Map<string, number>();

const GLOBAL_COOLDOWN_MS = 30 * 1000; // 30s between responses
let lastResponseTime = 0;

const MAX_RESPONSES_PER_HOUR = 12;
const channelResponseLog = new Map<string, number[]>();

const MIN_MESSAGE_LENGTH = 15;

// Probability gates
const AUTONOMOUS_RESPONSE_PROBABILITY = 0.55; // 55% of relevant messages

// Channels config
const activeChannels = process.env.PERSONALITY_CHANNELS
  ? process.env.PERSONALITY_CHANNELS.split(",").map((s) => s.trim())
  : [];

const skipChannelNames = [
  "logs",
  "mod-logs",
  "audit",
  "commands",
  "bot-commands",
  "config",
  "setup",
];

// ─── Conversation flow tracking ──────────────────────────────────────────────

const channelLastMessage = new Map<string, number>();
const recentInteractions = new Map<string, number>(); // userId -> last interaction

// ─── Human-like typing simulation ─────────────────────────────────────────────

function calculateTypingDelay(text: string): number {
  const charsPerSecond = 10 + Math.random() * 5;
  const baseDelay = Math.min(8000, (text.length / charsPerSecond) * 1000);
  const thinkTime = Math.random() < 0.3 ? 1000 + Math.random() * 3000 : 0;
  return Math.round(baseDelay + thinkTime);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Heuristic gate ──────────────────────────────────────────────────────────

function shouldConsiderResponding(message: Message): boolean {
  if (message.author.bot) return false;
  if (!message.guild) return false;
  if (process.env.PERSONALITY_ENABLED === "false") return false;

  const content = message.content.trim();
  if (content.length < MIN_MESSAGE_LENGTH) return false;
  if (/^https?:\/\/\S+$/.test(content)) return false;
  if (/^[\p{Emoji}\s]+$/u.test(content)) return false;

  const channelName = (message.channel as { name?: string }).name || "";
  if (skipChannelNames.some((skip) => channelName.includes(skip))) return false;
  if (activeChannels.length > 0 && !activeChannels.includes(message.channelId)) return false;
  if (Date.now() - lastResponseTime < GLOBAL_COOLDOWN_MS) return false;

  const lastUserResponse = userCooldowns.get(message.author.id) ?? 0;
  if (Date.now() - lastUserResponse < USER_COOLDOWN_MS) return false;

  const now = Date.now();
  const log = channelResponseLog.get(message.channelId) ?? [];
  const recent = log.filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= MAX_RESPONSES_PER_HOUR) return false;
  channelResponseLog.set(message.channelId, recent);

  return true;
}

// ─── Conversation flow: don't interrupt ──────────────────────────────────────

function isConversationActive(channelId: string): boolean {
  const lastMsg = channelLastMessage.get(channelId) ?? 0;
  return Date.now() - lastMsg < 3000;
}

export function trackChannelActivity(channelId: string): void {
  channelLastMessage.set(channelId, Date.now());
}

// ─── Relevance + emotion check ───────────────────────────────────────────────

interface RelevanceDecision {
  shouldRespond: boolean;
  emotion: string;
  reason: string;
}

async function checkRelevanceAndEmotion(message: Message): Promise<RelevanceDecision | null> {
  try {
    const recentMessages = await message.channel.messages.fetch({ limit: 5 }).catch(() => null);
    const context = recentMessages
      ? [...recentMessages.values()]
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .filter((m) => !m.author.bot || m.id === message.id)
          .map((m) => `${m.author.username}: ${m.content.slice(0, 150)}`)
          .join("\n")
      : message.content.slice(0, 300);

    const prompt =
      `Analyse ce message Discord et décide si John (un membre de la communauté) devrait répondre.\n\n` +
      `Conversation récente:\n${context}\n\n` +
      `Critères:\n` +
      `- YES si: question, débat, blague, sujet gaming, opinion demandée, ou John est directement impliqué\n` +
      `- NO si: spam, lien seul, commande bot, conversation privée entre deux personnes, hors sujet\n` +
      `- Sois sélectif (environ 1 sur 4)\n\n` +
      `Réponds en JSON: {"respond": true/false, "emotion": "joie|colère|tristesse|neutre|excitation|humour|sérieux", "reason": "5 mots max"}`;

    // Try Groq first (ultra-fast, ~500 tokens/s)
    if (isGroqAvailable()) {
      const groqResult = await chatWithGroqJSON({
        systemPrompt: "Tu réponds uniquement en JSON valide. Sois rapide.",
        userMessage: prompt,
        maxTokens: 50,
        temperature: 0.3,
      });
      if (groqResult) {
        const respond = groqResult.respond;
        return {
          shouldRespond: respond === true || respond === "true",
          emotion: (groqResult.emotion as string) || "neutre",
          reason: (groqResult.reason as string) || "",
        };
      }
    }

    // Fallback: OpenRouter
    const client = getOpenAIClient();

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          { role: "system", content: "Tu réponds uniquement en JSON valide. Sois rapide." },
          { role: "user", content: prompt },
        ],
        max_tokens: 50,
        temperature: 0.3,
      },
      { timeout: 8_000 },
    );

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      respond?: boolean;
      emotion?: string;
      reason?: string;
    };

    return {
      shouldRespond: parsed.respond ?? false,
      emotion: parsed.emotion || "neutre",
      reason: parsed.reason || "",
    };
  } catch (error) {
    logger.debug(
      `[Personality] Relevance check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Fallback: if API fails, default to responding (better to respond than stay silent)
    return { shouldRespond: true, emotion: "neutre", reason: "API fallback" };
  }
}

// ─── Memory recall ───────────────────────────────────────────────────────────

async function recallUserContext(userId: string): Promise<string> {
  try {
    const facts = await prisma.memoryFact.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { value: true, category: true },
    });

    if (facts.length === 0) return "";

    const memoryStr = facts.map((f) => f.value.slice(0, 100)).join("; ");
    return `\n## Ce que tu sais sur ${userId.slice(-4)}\n${memoryStr}`;
  } catch {
    return "";
  }
}

// ─── Generate human-like response ────────────────────────────────────────────

async function generateHumanResponse(
  message: Message,
  emotion: string,
  userMemory: string,
): Promise<string | null> {
  try {
    const recentMessages = await message.channel.messages.fetch({ limit: 10 }).catch(() => null);
    const conversation = recentMessages
      ? [...recentMessages.values()]
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map((m) => {
            const name = m.author.bot ? m.author.username : m.author.username;
            return `${name}: ${m.content.slice(0, 250)}`;
          })
          .join("\n")
      : message.content.slice(0, 500);

    const lastInteraction = recentInteractions.get(message.author.id);
    const isFamiliar = lastInteraction && Date.now() - lastInteraction < 24 * 60 * 60 * 1000;
    const familiarityHint = isFamiliar
      ? "Tu connais déjà cette personne, sois naturel."
      : "Tu ne connais pas bien cette personne, reste courtois mais moins familier.";

    const emotionContext = emotion !== "neutre" ? `L'ambiance actuelle est: ${emotion}.` : "";

    const userPrompt =
      `Tu es sur Discord. Voici la conversation en cours:\n\n${conversation}\n\n` +
      `${emotionContext}\n${familiarityHint}${userMemory}\n\n` +
      `Réponds naturellement comme John le ferait. Sois concis, humain, authentique. ` +
      `Si le message ne mérite qu'une réponse courte ("mdrr", "vrai", "ok"), fais-le. ` +
      `Si ça mérite une vraie réponse avec ton avis, fais-le. Mais reste naturel.`;

    // Try Groq first (ultra-fast response generation)
    if (isGroqAvailable()) {
      const groqResponse = await chatWithGroq({
        systemPrompt: HUMAN_SYSTEM_PROMPT,
        userMessage: userPrompt,
        maxTokens: 400,
        temperature: 0.85,
      });
      if (groqResponse && groqResponse.length >= 2) {
        const response = groqResponse
          .replace(/\*\*/g, "")
          .replace(/^John Helldiver:\s*/i, "")
          .replace(/^John:\s*/i, "")
          .replace(/^(En tant que|Je suis là pour|N'hésitez pas)/i, "")
          .trim();
        if (response.length >= 2) return response.slice(0, 2000);
      }
    }

    // Fallback: OpenRouter
    const client = getOpenAIClient();

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          { role: "system", content: HUMAN_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.85,
        presence_penalty: 0.6,
        frequency_penalty: 0.3,
      },
      { timeout: 15_000 },
    );

    let response = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!response || response.length < 2) return null;

    // Clean AI-isms
    response = response
      .replace(/\*\*/g, "")
      .replace(/^John Helldiver:\s*/i, "")
      .replace(/^John:\s*/i, "")
      .replace(/^(En tant que|Je suis là pour|N'hésitez pas)/i, "")
      .trim();

    if (!response || response.length < 2) return null;
    return response.slice(0, 2000);
  } catch (error) {
    logger.error(
      `[Personality] Generate failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Fallback: generate a simple contextual response without AI
    const fallbackResponses = [
      "ouf",
      "vrai ça",
      "mdrr",
      "ça va le faire",
      "intéressant ça",
      "je suis d'accord",
      "pas faux",
      "bref",
      "ok",
      "graves",
    ];
    return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  }
}

// ─── Split long responses into multiple messages ─────────────────────────────

function splitResponse(text: string): string[] {
  if (text.length <= 200) return [text];

  const sentences = text.match(/[^.!?]+[.!?]*\s*/g);
  if (!sentences || sentences.length <= 1) return [text];

  const messages: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > 250 && current.length > 0) {
      messages.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) messages.push(current.trim());

  return messages.length > 0 ? messages : [text];
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function handlePersonalityMessage(client: Client, message: Message): Promise<void> {
  trackChannelActivity(message.channelId);

  // 1. Heuristic gate
  if (!shouldConsiderResponding(message)) return;

  // 2. Don't interrupt active fast conversations
  if (isConversationActive(message.channelId)) return;

  // 3. Determine if mentioned
  const isMentioned = message.mentions.has(client.user!);

  // 4. Relevance + emotion check
  let emotion = "neutre";
  if (!isMentioned) {
    if (Math.random() > AUTONOMOUS_RESPONSE_PROBABILITY) return;

    const decision = await checkRelevanceAndEmotion(message);
    if (!decision || !decision.shouldRespond) {
      logger.debug(`[Personality] Skipped: ${decision?.reason ?? "no decision"}`);
      return;
    }
    emotion = decision.emotion;
  }

  // 5. Recall user memory
  const userMemory = await recallUserContext(message.author.id);

  // 6. Generate response
  const response = await generateHumanResponse(message, emotion, userMemory);
  if (!response) return;

  // 7. Split into natural messages
  const messages = splitResponse(response);

  // 8. Post with human-like timing
  try {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Simulate typing
      const typingDelay = calculateTypingDelay(msg);
      if (message.channel.isTextBased() && "sendTyping" in message.channel) {
        await (message.channel as { sendTyping: () => Promise<void> }).sendTyping().catch(() => {});
      }
      await sleep(typingDelay);

      // Send (rarely as embed, mostly plain text like a human)
      if (i === 0 && Math.random() < 0.08 && msg.length > 60) {
        const embed = new EmbedBuilder()
          .setColor(0x00ff41)
          .setAuthor({
            name: PERSONALITY_NAME,
            iconURL: client.user?.displayAvatarURL() || undefined,
          })
          .setDescription(msg)
          .setTimestamp();
        await (message.channel as { send: (opts: unknown) => Promise<unknown> }).send({
          embeds: [embed],
        });
      } else {
        await (message.channel as { send: (content: string) => Promise<unknown> }).send(msg);
      }

      // Small pause between messages
      if (i < messages.length - 1) {
        await sleep(500 + Math.random() * 1500);
      }
    }

    // 9. Update tracking
    lastResponseTime = Date.now();
    userCooldowns.set(message.author.id, Date.now());
    recentInteractions.set(message.author.id, Date.now());
    const log = channelResponseLog.get(message.channelId) ?? [];
    log.push(Date.now());
    channelResponseLog.set(message.channelId, log);

    logger.info(
      `[Personality] 🎖️ ${PERSONALITY_NAME} a répondu dans #${(message.channel as { name?: string }).name || message.channelId} (${messages.length} msg, ${emotion}, mention: ${isMentioned})`,
    );
  } catch (error) {
    logger.error(
      `[Personality] Post failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── Periodic proactive messages ─────────────────────────────────────────────

let proactiveInterval: ReturnType<typeof setInterval> | null = null;

async function generateProactiveMessage(client: Client): Promise<string | null> {
  try {
    const openaiClient = getOpenAIClient();
    const guild = client.guilds.cache.first();
    if (!guild) return null;

    // Get a recent topic from the guild
    const channels = guild.channels.cache.filter((c) => c.type === 0 && c.isTextBased());
    let recentTopic = "";
    for (const [, channel] of channels) {
      try {
        const msgs = await (channel as any).messages.fetch({ limit: 5 });
        const humanMsgs = [...msgs.values()].filter(
          (m: { author: { bot: boolean } }) => !m.author.bot,
        );
        if (humanMsgs.length > 0) {
          recentTopic = (humanMsgs[0] as { content: string }).content.slice(0, 200);
          break;
        }
      } catch {
        /* skip */
      }
    }

    const completion = await openaiClient.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          { role: "system", content: HUMAN_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Tu veux lancer une conversation sur Discord. ${recentTopic ? `Le dernier sujet discuté était: "${recentTopic}". ` : ""}Écris un message court et naturel pour démarrer une conversation. Sois spontané, comme un gars qui revient sur Discord et veut parler. 1-2 phrases max.`,
          },
        ],
        max_tokens: 150,
        temperature: 0.9,
      },
      { timeout: 12_000 },
    );

    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export function startPersonalityEngine(client: Client): void {
  if (process.env.PERSONALITY_ENABLED === "false") {
    logger.info("[Personality] Moteur de personnalité désactivé");
    return;
  }

  const proactiveHours = parseInt(process.env.PERSONALITY_PROACTIVE_HOURS || "0", 10);
  if (proactiveHours > 0) {
    const intervalMs = proactiveHours * 60 * 60 * 1000;
    proactiveInterval = setInterval(() => {
      void sendProactiveMessage(client);
    }, intervalMs);
    if (proactiveInterval.unref) proactiveInterval.unref();
    setTimeout(() => void sendProactiveMessage(client), 15 * 60 * 1000);
  }

  logger.info(
    `[Personality] 🎖️ Moteur humanoïde démarré (${PERSONALITY_NAME}, proactive: ${proactiveHours > 0 ? `${proactiveHours}h` : "off"}, model: ${config.openRouterModel})`,
  );
}

async function sendProactiveMessage(client: Client): Promise<void> {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const channels = guild.channels.cache;
    const generalChannel = channels.find(
      (c) =>
        c.type === 0 &&
        (c.name.includes("general") ||
          c.name.includes("général") ||
          c.name.includes("random") ||
          c.name.includes("chat") ||
          c.name.includes("discussion")),
    );

    if (!generalChannel || !generalChannel.isTextBased()) return;

    const msg = await generateProactiveMessage(client);
    if (!msg) return;

    if ("sendTyping" in generalChannel) {
      await (generalChannel as { sendTyping: () => Promise<void> }).sendTyping().catch(() => {});
    }
    await sleep(calculateTypingDelay(msg));

    await (generalChannel as { send: (content: string) => Promise<unknown> }).send(msg);
    lastResponseTime = Date.now();
    logger.info(`[Personality] 🎖️ Message proactif envoyé dans #${generalChannel.name}`);
  } catch (error) {
    logger.debug(
      `[Personality] Proactive failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function stopPersonalityEngine(): void {
  if (proactiveInterval) {
    clearInterval(proactiveInterval);
    proactiveInterval = null;
  }
  logger.info("[Personality] Moteur de personnalité arrêté");
}
