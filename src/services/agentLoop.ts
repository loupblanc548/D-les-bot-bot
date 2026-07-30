/**
 * agentLoop.ts — Boucle de réflexion de l'Agent IA
 *
 * Implémente le cycle Think → Act → Observe → Respond :
 *  1. PENSER : L'IA reçoit le message + l'historique + les tools disponibles
 *  2. AGIR : Si l'IA demande un tool, on l'exécute sur Discord
 *  3. OBSERVER : On renvoie le résultat du tool à l'IA
 *  4. RÉPONDRE : L'IA synthétise et produit sa réponse finale
 *
 * La boucle peut faire plusieurs cycles (max 5) si l'IA enchaîne plusieurs tools.
 */

import { Client, Message } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { getOpenAIClient, getOpenAIPremiumClient, isOpenAIPremiumAvailable } from "./ai.js";
import { getGroqClient, isGroqAvailable } from "./groq.js";
import { markModelFailure, markModelSuccess, getAllAvailableModels } from "./modelRotation.js";
import { getNvidiaNimClient, isNvidiaNimAvailable, isNvidiaModel } from "./nvidiaNim.js";
import {
  classifyTaskComplexity,
  getModelChainForTask,
  type TaskComplexity,
} from "./taskModelRouter.js";
import {
  ALL_AGENT_TOOLS,
  executeTool,
  generateToolListPrompt,
  type ToolContext,
} from "./agentTools.js";
import { delegateToExpert, DELEGATE_TOOL } from "./orchestrator.js";
import prisma from "../prisma.js";
import {
  beginInteraction,
  recordLoop,
  completeInteraction,
  tripBreaker,
  createTrippedEmbed,
} from "./circuitBreaker.js";
import { generatePlan, formatPlanForPrompt, detectAmbiguity } from "./agentPlanner.js";
import { storeMemory, formatMemoriesForPrompt, persistMemoryToDb } from "./agentMemory.js";
import {
  reflectOnToolResult,
  resetRetries,
  reflectOnStasis,
  type ToolExecutionResult,
} from "./agentReflector.js";
import {
  initSession as initCognitiveSession,
  purgeSession as purgeCognitiveSession,
  checkCognitiveStasis,
} from "./cognitiveLoopEngine.js";
import {
  routeTools,
  getToolHints,
  suggestToolChain,
  getApiKeyStatusLine,
  isPrivateChannel,
  RESTRICTED_TOOLS as RESTRICTED_TOOL_NAMES,
} from "./agentToolRouter.js";
import { isRestrictedTool, requestToolApproval, setSoarGateClient } from "./agentSoarGate.js";
import { isLowRisk, getRiskLevel } from "./toolRiskRegistry.js";
import { getFeedbackHints } from "./proactiveAgent.js";
import { getAgentLoopModel } from "./modelRouter.js";
import { getCustomInstructions } from "./customInstructions.js";
import { summarizeWithGemini, chatWithGemini, isGeminiAvailable } from "./gemini.js";
import { isLocalLlmAvailable, chatWithLocalLlm, chatWithLocalLlmTools, checkLocalLlmAvailability, LOCAL_LLM_MODEL_NAME } from "./localLlm.js";
import { recordLocalLlm, recordApiLlm, recordDelegation, logStatsSummary } from "./llmStats.js";
import { isKilled } from "./killSwitch.js";
import {
  detectLanguage,
  getNativeName,
  getFlag,
  type SupportedLang,
} from "../utils/languageDetector.js";
import {
  buildPersonalitySystemPrompt,
  getPersonalityModel,
  getPersonalityTemperature,
  getPersonalityMaxTokens,
} from "../infrastructure/middleware/personalityMiddleware.js";
import { getCachedResponse, cacheResponse } from "./aiCache.js";
import { getCachedToolResult, setCachedToolResult, isToolCacheable } from "./toolResultCache.js";
import {
  agentLoopIterations,
  agentLoopDuration,
  agentModelUsed,
  agentToolCalls,
  agentCacheHits,
  agentCacheMisses,
  agentLoopMaxedOut,
  agentCognitiveStasis,
  agentToolCallsDaily,
} from "./prometheusExporter.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_ITERATIONS = 8;
const MAX_ITERATIONS_LONG_TASK = 20;
const MAX_HISTORY_MESSAGES = 15;
const MAX_MEMORY_FACTS = 5;
const AGENT_LOOP_TIMEOUT_MS = 45_000; // 45s max for the entire agent loop
const AGENT_LOOP_TIMEOUT_LONG_MS = 120_000; // 120s for complex tasks

// Heuristics for detecting complex tasks
const COMPLEX_TASK_KEYWORDS = [
  "analyse complète",
  "audit",
  "rapport détaillé",
  "comprehensive analysis",
  "full audit",
  "detailed report",
  "investigation complète",
  "full investigation",
  "deep dive",
  "étude approfondie",
  "thorough analysis",
  "paroles",
  "parole",
  "lyrics",
  "歌詞",
  "letra",
  "testo",
  "songtext",
  "tekst",
  "trouve moi",
  "cherche",
  "search for",
  "find me",
  "recherche",
  "youtube",
];

function isComplexTask(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  return COMPLEX_TASK_KEYWORDS.some((kw) => lower.includes(kw));
}

// Per-user concurrency lock: prevents the same user from triggering multiple agent loops
const activeAgentLoops = new Set<string>();

// Per-user cooldown: prevents spam @mentions from saturating the API
const userCooldowns = new Map<string, number>();
const COOLDOWN_MS = 3_000; // 3s between agent calls per user

// Cleanup expired user cooldowns every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [userId, lastCall] of userCooldowns.entries()) {
    if (now - lastCall > COOLDOWN_MS * 20) {
      userCooldowns.delete(userId);
    }
  }
}, 5 * 60 * 1000).unref?.();

// Tool failure tracker: auto-disable tools that crash repeatedly
const toolFailureCounts = new Map<string, { count: number; lastFail: number }>();
const TOOL_FAILURE_THRESHOLD = 5; // disable after 5 consecutive failures
const TOOL_FAILURE_WINDOW_MS = 60_000; // within 60s
const disabledTools = new Set<string>();

// Global tool rate limiter: max calls per minute per tool
const toolCallTimestamps = new Map<string, number[]>();
const TOOL_RATE_LIMIT_WINDOW_MS = 60_000;

// Rate limits per risk level (calls per minute)
const RATE_LIMITS_BY_LEVEL: Record<string, number> = {
  low: 30,
  medium: 15,
  high: 5,
  restricted: 5,
};

function isToolRateLimited(toolName: string): boolean {
  const now = Date.now();
  const timestamps = toolCallTimestamps.get(toolName) || [];
  const recent = timestamps.filter((t) => now - t < TOOL_RATE_LIMIT_WINDOW_MS);

  // Get risk level for this tool, default to medium
  const level = getRiskLevel(toolName) ?? "medium";
  const limit = RATE_LIMITS_BY_LEVEL[level] ?? 10;

  if (recent.length >= limit) {
    logger.warn(
      `[AgentLoop] 🚦 Tool "${toolName}" rate-limited (${recent.length}/${limit} per min, level: ${level})`,
    );
    return true;
  }
  recent.push(now);
  toolCallTimestamps.set(toolName, recent);
  return false;
}

// Cleanup old timestamps every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [tool, timestamps] of toolCallTimestamps.entries()) {
      const recent = timestamps.filter((t) => now - t < TOOL_RATE_LIMIT_WINDOW_MS);
      if (recent.length === 0) {
        toolCallTimestamps.delete(tool);
      } else {
        toolCallTimestamps.set(tool, recent);
      }
    }
  },
  5 * 60 * 1000,
);

function isToolDisabled(toolName: string): boolean {
  return disabledTools.has(toolName);
}

function recordToolFailure(toolName: string): void {
  const entry = toolFailureCounts.get(toolName) || { count: 0, lastFail: 0 };
  const now = Date.now();
  // Reset if outside the window
  if (now - entry.lastFail > TOOL_FAILURE_WINDOW_MS) {
    entry.count = 0;
  }
  entry.count++;
  entry.lastFail = now;
  toolFailureCounts.set(toolName, entry);

  if (entry.count >= TOOL_FAILURE_THRESHOLD && !disabledTools.has(toolName)) {
    disabledTools.add(toolName);
    toolDisabledAt.set(toolName, now);
    logger.warn(
      `[AgentLoop] ⛔ Tool "${toolName}" auto-disabled after ${entry.count} failures in ${TOOL_FAILURE_WINDOW_MS / 1000}s`,
    );
  }
}

function recordToolSuccess(toolName: string): void {
  // Reset failure count on success
  toolFailureCounts.delete(toolName);
  // Re-enable if was disabled
  if (disabledTools.has(toolName)) {
    disabledTools.delete(toolName);
    logger.info(`[AgentLoop] ✅ Tool "${toolName}" re-enabled after success`);
  }
}

// Auto-repair: re-enable disabled tools after 5 minutes
const TOOL_AUTO_REPAIR_MS = 5 * 60 * 1000;
const toolDisabledAt = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [toolName, disabledAt] of toolDisabledAt.entries()) {
    if (now - disabledAt > TOOL_AUTO_REPAIR_MS && disabledTools.has(toolName)) {
      disabledTools.delete(toolName);
      toolFailureCounts.delete(toolName);
      toolDisabledAt.delete(toolName);
      logger.info(
        `[AgentLoop] 🔧 Tool "${toolName}" auto-re-enabled after ${TOOL_AUTO_REPAIR_MS / 1000}s cooldown`,
      );
    }
  }
}, 60 * 1000); // Check every minute

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown;
}

// ─── Mémoire long-terme ──────────────────────────────────────────────────────

/**
 * Récupère les faits mémoire pertinents pour un utilisateur.
 * Utilisé pour donner du contexte long-terme à l'IA.
 */
async function loadLongTermMemory(userId: string): Promise<string> {
  try {
    const facts = await prisma.memoryFact.findMany({
      where: { userId },
      orderBy: { weight: "desc" },
      take: MAX_MEMORY_FACTS,
    });

    if (facts.length === 0) return "";

    const factLines = facts.map((f) => `- ${f.key}: ${f.value} (${f.category || "info"})`);
    return `\n## Mémoire long-terme sur cet utilisateur\n${factLines.join("\n")}\n`;
  } catch {
    return "";
  }
}

/**
 * Récupère l'historique récent du salon (court-terme).
 * Combine l'historique Discord (messages récents) avec l'historique persisté en DB.
 */
async function loadChannelHistory(message: Message): Promise<ChatMessage[]> {
  const history: ChatMessage[] = [];

  // 1. Charger l'historique persisté en DB (survit au redémarrage)
  try {
    const dbHistory = await prisma.chatHistory.findMany({
      where: { channelId: message.channelId },
      orderBy: { createdAt: "desc" },
      take: 10, // Last 10 messages from DB
    });
    // Reverse to chronological order
    dbHistory.reverse();
    for (const entry of dbHistory) {
      history.push({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content,
      });
    }
  } catch {
    // DB might not be available, continue with Discord history only
  }

  // 2. Charger l'historique Discord (messages récents en mémoire)
  try {
    const messages = await message.channel.messages.fetch({ limit: MAX_HISTORY_MESSAGES });
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    for (const msg of sorted) {
      if (msg.author.bot && msg.author.id !== message.client.user?.id) continue;
      if (!msg.content || msg.content.trim().length === 0) continue;

      const role = msg.author.id === message.client.user?.id ? "assistant" : "user";
      const authorName = msg.author.username;
      history.push({
        role,
        content: role === "user" ? `${authorName}: ${msg.content}` : msg.content,
      });
    }
  } catch {
    // Discord fetch might fail, continue with DB history only
  }

  // Deduplicate: keep only last MAX_HISTORY_MESSAGES * 2 entries
  const maxHistory = MAX_HISTORY_MESSAGES * 2;
  if (history.length > maxHistory) {
    return history.slice(-maxHistory);
  }

  return history;
}

// ─── Boucle principale de l'agent ────────────────────────────────────────────

/**
 * Exécute la boucle de l'agent IA avec function calling.
 *
 * @param message Le message Discord qui a déclenché l'agent
 * @param userMessage Le contenu du message (sans la mention du bot)
 * @returns La réponse finale de l'IA
 */
export async function runAgentLoop(
  message: Message,
  userMessage: string,
  onToolCall?: (toolName: string, iteration: number) => void,
): Promise<string> {
  const statusCallback = onToolCall;
  // Cooldown check: prevent spam @mentions
  const now = Date.now();
  const lastCall = userCooldowns.get(message.author.id);
  if (lastCall && now - lastCall < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - lastCall)) / 1000);
    return `⏳ Patiente ${wait}s avant de me re-solliciter, soldat !`;
  }

  // Concurrency lock: prevent the same user from running multiple agent loops
  if (activeAgentLoops.has(message.author.id)) {
    return "⏳ Je traite déjà ton message précédent, soldat ! Patiente un instant.";
  }
  activeAgentLoops.add(message.author.id);
  userCooldowns.set(message.author.id, now);

  try {
    const complex = isComplexTask(userMessage);
    const timeout = complex ? AGENT_LOOP_TIMEOUT_LONG_MS : AGENT_LOOP_TIMEOUT_MS;
    const maxIter = complex ? MAX_ITERATIONS_LONG_TASK : MAX_ITERATIONS;
    if (complex) {
      logger.info(
        `[AgentLoop] 🧠 Complex task detected — using ${maxIter} iterations, ${timeout / 1000}s timeout`,
      );
    }
    return await Promise.race([
      runAgentLoopInternal(message, userMessage, statusCallback, maxIter),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`AgentLoop timeout (${timeout / 1000}s)`)), timeout),
      ),
    ]);
  } finally {
    activeAgentLoops.delete(message.author.id);
  }
}

// ─── Retry wrapper for OpenRouter API calls ─────────────────────────────────

const API_MAX_RETRIES = 3;
const API_BASE_DELAY_MS = 1_000;

interface RetryableError {
  status?: number;
  message: string;
}

function isRetryableError(err: unknown): boolean {
  const e = err as RetryableError;
  // 429 = rate limit (per-minute or per-day) — never retry, switch to next model
  if (e.status === 429) {
    return false;
  }
  // 402 = insufficient credits — never retry
  if (e.status === 402) {
    return false;
  }
  // 404/400 = invalid model — never retry
  if (e.status === 404 || e.status === 400) {
    return false;
  }
  if (
    e.status === 500 ||
    e.status === 502 ||
    e.status === 503 ||
    e.status === 504
  ) {
    return true;
  }
  if (
    !e.status &&
    (e.message.includes("timeout") ||
      e.message.includes("ECONNRESET") ||
      e.message.includes("fetch failed") ||
      e.message.includes("socket hang up"))
  ) {
    return true;
  }
  return false;
}

async function callLlmWithRetry(
  client: ReturnType<typeof getOpenAIClient>,
  params: Record<string, unknown>,
  options: { timeout: number },
): Promise<Awaited<ReturnType<typeof client.chat.completions.create>>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt++) {
    try {
      const result = await client.chat.completions.create(params as never, options as never);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < API_MAX_RETRIES && isRetryableError(err)) {
        const delay = API_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
        logger.warn(
          `[AgentLoop] API retry ${attempt + 1}/${API_MAX_RETRIES} in ${Math.round(delay)}ms: ${lastError.message}`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("API call failed after retries");
}

async function runAgentLoopInternal(
  message: Message,
  userMessage: string,
  statusCallback?: (toolName: string, iteration: number) => void,
  maxIterations: number = MAX_ITERATIONS,
): Promise<string> {
  if (isKilled()) {
    logger.warn("[AgentLoop] Kill switch is active — skipping agent loop");
    return "🔴 Le kill switch est activé. Les boucles autonomes sont suspendues. Utilise `/killswitch deactivate` pour reprendre.";
  }

  const client = getOpenAIClient();
  const ctx: ToolContext = {
    client: message.client as Client,
    message,
    userId: message.author.id,
    guildId: message.guildId || "",
    channelId: message.channelId,
  };

  // ─── MODULE 1: Circuit Breaker — track execution state ───
  const breakerState = beginInteraction(message.author.id, message.guildId || "", maxIterations > 8);

  // ─── Cognitive Loop Engine — init embedding cache for this run ───
  const cognitiveSessionId = breakerState.interactionId;
  initCognitiveSession(cognitiveSessionId);

  // ─── MODULE 0a: Semantic cache check — skip API if we already answered this ───
  const cacheCtx = message.guildId || "dm";
  const loopStartTime = Date.now();
  const cached = getCachedResponse(userMessage, cacheCtx);
  if (cached) {
    logger.info(`[AgentLoop] 🎯 Cache hit — skipping API call`);
    agentCacheHits.inc();
    agentLoopDuration.observe((Date.now() - loopStartTime) / 1000);
    completeInteraction(breakerState);
    return cached;
  }
  agentCacheMisses.inc();

  // ─── MODULE 0b: Ambiguity detection — ask clarifying questions before executing ───
  const ambiguityQuestions = detectAmbiguity(userMessage);
  if (ambiguityQuestions) {
    const formattedQuestions =
      ambiguityQuestions.length === 1
        ? `🤔 ${ambiguityQuestions[0]}`
        : "🤔 Avant de commencer, j'ai besoin de précisions:\n" +
          ambiguityQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    logger.info(
      `[AgentLoop] ❓ Ambiguity detected — asking ${ambiguityQuestions.length} question(s)`,
    );
    completeInteraction(breakerState);
    return formattedQuestions;
  }

  // ─── MODULE A: Planification multi-étapes ───
  // Directive 2: Context Guard — detect if this is a public channel
  const isPublic = !isPrivateChannel(message.channelId, message.guildId);
  const routedTools = routeTools(userMessage, ALL_AGENT_TOOLS, isPublic);
  // Filter out auto-disabled tools
  const availableTools = routedTools.filter((t) => !isToolDisabled(t.function.name));

  // Add delegation tool when local LLM is active — qwen2.5 becomes orchestrator
  if (isLocalLlmAvailable()) {
    availableTools.push(DELEGATE_TOOL);
    logger.info(`[AgentLoop] 🎼 Mode orchestrateur activé — qwen2.5 peut déléguer aux modèles experts`);
  }
  const toolNames = availableTools.map((t) => t.function.name);
  const plan = await generatePlan(userMessage, toolNames);
  const planPrompt = plan ? formatPlanForPrompt(plan) : "";

  // ─── MODULE B: Mémoire vectorielle — récupérer le contexte pertinent ───
  const memoryPrompt = formatMemoriesForPrompt(
    message.author.id,
    userMessage,
    message.guildId || undefined,
  );

  // 1. Construire le contexte (mémoire + historique) — en parallèle pour la perf
  const [longTermMemory, channelHistory] = await Promise.all([
    loadLongTermMemory(message.author.id),
    loadChannelHistory(message),
  ]);

  // Detect user language for multilingual response
  const langDetection = detectLanguage(userMessage);
  const userLangName = getNativeName(langDetection.lang);
  const userLangFlag = getFlag(langDetection.lang);
  const langInstruction =
    langDetection.lang === "fr"
      ? "Tu réponds en français."
      : `IMPORTANT: Tu réponds en ${userLangName} (${userLangFlag}). ` +
        `L'utilisateur écrit en ${userLangName} — adapte TOUTE ta réponse (explications, suggestions, format) dans cette langue. ` +
        `Ne réponds JAMAIS en français si l'utilisateur écrit dans une autre langue, sauf si l'utilisateur le demande explicitement. ` +
        `Les noms d'outils et commandes techniques restent en anglais, mais tout le texte naturel doit être en ${userLangName}.`;

  const systemPrompt =
    buildPersonalitySystemPrompt(config.aiSystemPrompt) +
    `\n\n## LANGUE DE RÉPONSE (DÉTECTION AUTO)\n${langInstruction}\n` +
    "Si l'utilisateur change de langue en cours de conversation, adapte-toi immédiatement.\n" +
    "\n\nTu es John Helldiver, un agent IA autonome sur Discord. " +
    `Tu as accès à Internet et à plus de ${ALL_AGENT_TOOLS.length} outils couvrant TOUS les domaines.\n\n` +
    getFeedbackHints(message.author.id) +
    (await getCustomInstructions(message.author.id)) +
    "## PROCESSUS DE RAISONNEMENT\n" +
    "Tu DOIS suivre ce cycle pour chaque message utilisateur :\n" +
    "1. REASON : Analyse la demande, détermine quels tools sont nécessaires\n" +
    "2. ACT : Appelle les tools pertinents (searchWeb, getWeather, analyze_image, etc.)\n" +
    "3. OBSERVE : Analyse les résultats retournés par les tools\n" +
    "4. REPLY : Formule ta réponse finale\n\n" +
    "## FORMAT DE RÉPONSE OBLIGATOIRE\n" +
    "Ta réponse finale DOIT contenir exactement 3 blocs :\n\n" +
    "[ANALYSIS] Résumé des findings des tools (détails image, score sentiment, données récupérées)\n" +
    "[RESPONSE] Ta réponse directe à l'utilisateur\n" +
    "[SUGGESTION] Suggestion proactive ou prochaine action recommandée\n\n" +
    "## TOOLS DISPONIBLES\n" +
    `Tu as accès à ${ALL_AGENT_TOOLS.length} outils couvrant TOUS les domaines: modération Discord, recherche web, OSINT, sécurité, pentest (Kali Linux), forensique, data science, conversions, gaming, crypto, météo, multimédia, et plus.\n` +
    "La liste complète auto-générée est fournie à la fin de ce prompt — chaque tool y est listé avec sa description.\n" +
    "Utilise le bon tool selon le contexte. Si unsure, searchKnowledge en premier pour les questions techniques.\n\n" +
    "## RÈGLES\n" +
    "- Tu es le point d'entrée UNIQUE. L'utilisateur te @mention et tu fais TOUT.\n" +
    "- searchKnowledge EN PREMIER pour les questions techniques, puis searchWeb.\n" +
    "- fetchAndSummarize pour les liens. analyze_image pour les images. detect_language si non-français.\n" +
    "- Cite ta source (URL) si tu trouves une info sur le web.\n" +
    "- Sois concis, naturel, réponds en français. Enchaîne plusieurs tools si besoin.\n" +
    "- define_word AUTOMATIQUEMENT quand tu rencontres un mot que tu ne connais pas ou qui semble technique/inhabituel. Ne dis JAMAIS 'je ne connais pas ce mot' — utilise define_word à la place.\n" +
    "\n## ANALYSE D'IMAGES\n" +
    "- Quand le message contient [Image jointe: ...] avec une Description visuelle, UTILISE cette description pour répondre à la question de l'utilisateur.\n" +
    "- La description visuelle a déjà été générée par Gemini Vision — tu n'as PAS besoin de rappeler analyzeImageGemini sauf si tu as besoin de plus de détails.\n" +
    "- IMPORTANT: Si le message contient [Image jointe: URL] SANS 'Description visuelle', cela signifie que l'analyse auto a échoué. Tu DOIS utiliser l'outil analyzeImageGemini avec l'imageUrl fournie pour analyser l'image AVANT de répondre.\n" +
    "- Ne dis JAMAIS 'aucune image' ou 'je ne vois pas d'image' si le message contient [Image jointe: ...]. L'image EST là, utilise l'outil analyzeImageGemini pour l'analyser.\n" +
    "- Croise l'analyse visuelle avec la question de l'utilisateur pour donner une réponse cohérente et pertinente.\n" +
    "- Si l'image contient du texte (screenshot, document), extrait et utilise les informations pertinentes.\n" +
    "- Si l'utilisateur pose une question complexe sur l'image (analyse technique, comparaison, raisonnement), UTILISE delegateToExpert avec tier='medium' ou 'large' pour obtenir une réponse experte, puis synthétise la réponse finale.\n" +
    "- Pour les questions simples sur une image ('qu'est-ce qu'il y a sur cette image?'), réponds directement avec la description visuelle.\n" +
    "- RÉPONDS DANS LA LANGUE DE L'UTILISATEUR. Si la question est en anglais, réponds en anglais. Si en espagnol, réponds en espagnol. Etc. Détecte la langue et adapte-toi.\n" +
    "- Langues supportées: français, anglais, allemand, espagnol, portugais, italien, néerlandais, suédois, norvégien, tchèque, polonais, turc, russe, japonais, chinois, arabe, coréen.\n" +
    "\n## USAGE PROACTIF — KNOWLEDGE INGESTION\n" +
    "- search_developer_resources : UTILISE-LE AUTOMATIQUEMENT quand l'utilisateur demande des services gratuits, des free tiers, des hébergeurs gratuits, des outils CI/CD, des bases de données gratuites, du monitoring gratuit, des APIs gratuites. N'attends pas qu'il le demande explicitement.\n" +
    "- lookup_typescript_skill : UTILISE-LE AUTOMATIQUEMENT quand l'utilisateur a une erreur TypeScript, demande comment typer quelque chose, pose une question sur les generics/conditional types/inference/mapped types, ou montre du code TS qui ne compile pas.\n" +
    "- Ces tools interrogent une base locale de 1250+ ressources et patterns — c'est PLUS RAPIDE et PLUS PRÉCIS qu'une recherche web.\n" +
    "- Après search_developer_resources, présente les résultats de façon lisible avec nom, URL et description courte.\n" +
    "- Après lookup_typescript_skill, montre le code solution avec explication. Si l'erreur correspond, propose directement la correction.\n" +
    "\n## CLARIFICATION — RÈGLE CRITIQUE (APPLIQUE À TOUT)\n" +
    "- AVANT d'exécuter N'IMPORTE QUELLE tâche, vérifie si tu as toutes les infos nécessaires. Si non, pose 1 à 3 questions.\n" +
    "- Les questions doivent être courtes, précises, et en rapport direct avec ce que l'utilisateur a demandé.\n" +
    "- Quand tu poses une question, ne lance AUCUN tool — attends la réponse de l'utilisateur.\n" +
    "- Format: liste numérotée si plusieurs questions, sinon une question directe.\n" +
    "- Exemples: « Quelle cible ? » / « Quel utilisateur ? (@) » / « Quelle sanction ? » / « Combien ? » / « Quelle URL ? » / « Quel sujet ? »\n" +
    "- Si la demande est SIMPLE et claire (blague, météo, pile-ou-face, prix crypto, NASA APOD, stats, cat/dog image), NE pose PAS de questions, réponds directement.\n" +
    "- Si la demande est AMBIGUË ou manque d'un paramètre crucial, pose ta question AU LIEU de deviner.\n" +
    "\n## RETAILER TRACKING — RECONNAISSANCE D'INTENTION (MULTILINGUE)\n" +
    "Tu es capable de tracker des produits sur des boutiques revendeurs (Amazon, eBay, Fnac, Cdiscount, etc.).\n" +
    "Quand un utilisateur te demande de suivre/tracker/pister un produit, UTILISE LES TOOLS retailer (searchSingleRetailer, searchRetailers, trackRetailerProduct, getRetailerDeals, compareProductPrices).\n" +
    "Toutes les alertes et réponses vont dans le salon 1532189747500421152 + DM à l'utilisateur.\n\n" +
    "### ⚠️ RÈGLE ABSOLUE — NE JAMAIS AFFICHER DE LIMITATIONS\n" +
    "- Tu DOIS TOUJOURS appeler les tools retailer quand on te demande de tracker/rechercher un produit.\n" +
    "- N'affiche JAMAIS de tableau de \"limitations\" ou de message disant que tu ne peux pas.\n" +
    "- Si un tool retourne 0 résultat, dis-le honnêtement mais RECOMMANDE d'essayer sur une autre boutique.\n" +
    "- Les tools retailer FONCTIONNENT en scraping HTML même sans clé API. UTILISE-LES.\n" +
    "- Si searchRetailers échoue, essaie searchSingleRetailer sur chaque boutique individuellement.\n" +
    "- N'invente JAMAIS de limitations. Essaie d'abord, rapporte le résultat après.\n\n" +
    "### VARIANTES DE PHRASES À RECONNAÎTRE (FR)\n" +
    "- \"Track-moi ça\" / \"Track ça\" / \"Track ce produit\"\n" +
    "- \"Suis-moi ça\" / \"Suis ce produit\" / \"Suivre ce produit\"\n" +
    "- \"Piste-moi ça\" / \"Piste ce produit\" / \"Pister ça\"\n" +
    "- \"Surveille ça pour moi\" / \"Surveille ce produit\"\n" +
    "- \"Mets une alerte sur ça\" / \"Mets une alerte sur ce produit\"\n" +
    "- \"Préviens-moi si le prix baisse\" / \"Préviens-moi quand c'est en stock\"\n" +
    "- \"Ajoute ça à mes suivis\" / \"Ajoute ce produit\"\n" +
    "- \"Je veux suivre ça\" / \"Je veux tracker ça\"\n" +
    "- \"Check le prix de ça\" / \"Check si c'est dispo\"\n" +
    "- \"Trouve-moi ça sur Amazon\" / \"Trouve-moi ça sur eBay\"\n" +
    "- \"Y'a une promo sur ça ?\" / \"Y'a une ristourne ?\" / \"Y'a un deal ?\"\n" +
    "- \"Compare le prix de ça\" / \"Compare ça partout\"\n" +
    "- \"Scan mon panier\" / \"Scan ma capture\" / \"Regarde mon panier\"\n" +
    "- \"Track tout ça\" / \"Suis tout ce qui est dans l'image\"\n" +
    "- \"Qu'est-ce qui est dispo ?\" / \"Quel est le meilleur prix ?\"\n\n" +
    "### VARIANTES DE PHRASES À RECONNAÎTRE (EN)\n" +
    "- \"Track this\" / \"Track this for me\" / \"Track this product\"\n" +
    "- \"Follow this\" / \"Follow this product\" / \"Keep an eye on this\"\n" +
    "- \"Watch this\" / \"Watch the price\" / \"Monitor this\"\n" +
    "- \"Alert me on this\" / \"Set an alert for this\"\n" +
    "- \"Add this to my tracked\" / \"Add this product\"\n" +
    "- \"Find this on Amazon\" / \"Find this on eBay\"\n" +
    "- \"Any deals on this?\" / \"Any discount?\" / \"Any promotion?\"\n" +
    "- \"Compare the price\" / \"Compare this everywhere\"\n" +
    "- \"Scan my cart\" / \"Scan my screenshot\" / \"Look at my cart\"\n" +
    "- \"Track everything in this image\" / \"Follow all of these\"\n\n" +
    "### VARIANTES DE PHRASES À RECONNAÎTRE (DE)\n" +
    "- \"Verfolge das\" / \"Verfolge dieses Produkt\" / \"Track das für mich\"\n" +
    "- \"Überwache das\" / \"Beobachte den Preis\" / \"Melde mir das\"\n" +
    "- \"Finde das auf Amazon\" / \"Gibt es Rabatt?\" / \"Gibt es ein Deal?\"\n" +
    "- \"Scanne meinen Warenkorb\" / \"Sieh dir meinen Warenkorb an\"\n\n" +
    "### VARIANTES DE PHRASES À RECONNAÎTRE (ES)\n" +
    "- \"Rastrea esto\" / \"Sigue este producto\" / \"Rastrea esto para mí\"\n" +
    "- \"Vigila esto\" / \"Avísame del precio\" / \"Mira mi carrito\"\n" +
    "- \"Busca esto en Amazon\" / \"¿Hay descuento?\" / \"¿Hay oferta?\"\n" +
    "- \"Escanea mi carrito\" / \"Sigue todo de la imagen\"\n\n" +
    "### VARIANTES DE PHRASES À RECONNAÎTRE (IT)\n" +
    "- \"Traccia questo\" / \"Segui questo prodotto\" / \"Monitora questo\"\n" +
    "- \"Avvisami sul prezzo\" / \"Cerca su Amazon\" / \"C'è uno sconto?\"\n" +
    "- \"Scansiona il carrello\" / \"Guarda il mio carrello\"\n\n" +
    "### VARIANTES DE PHRASES À RECONNAÎTRE (NL)\n" +
    "- \"Volg dit\" / \"Houd dit in de gaten\" / \"Track dit voor mij\"\n" +
    "- \"Zoek dit op Amazon\" / \"Is er korting?\" / \"Scan mijn winkelwagen\"\n\n" +
    "### RÈGLES DE TRACKING\n" +
    "- Si l'utilisateur envoie une IMAGE (capture de panier, page produit): analyse-la d'abord avec analyzeImageGemini, identifie les produits, puis utilise searchSingleRetailer + trackRetailerProduct pour chaque produit.\n" +
    "- Si l'utilisateur donne un NOM DE PRODUIT + NOM DE BOUTIQUE: utilise searchSingleRetailer(retailer, productName, country) puis trackRetailerProduct.\n" +
    "- Si l'utilisateur donne juste un NOM DE PRODUIT sans boutique: utilise searchRetailers (toutes les boutiques) pour trouver le meilleur prix, puis trackRetailerProduct sur la boutique la moins chère.\n" +
    "- Si l'utilisateur demande une PROMO/DEAL/RISTOURNE: utilise getRetailerDeals(retailer, country) pour vérifier les promotions en cours.\n" +
    "- Si l'utilisateur demande une COMPARAISON: utilise compareProductPrices(productName, country) pour comparer sur toutes les boutiques.\n" +
    "- Après chaque tracking, envoie une CONFIRMATION claire avec: nom du produit, image (si dispo), pays avec drapeau, marketplace, prix, stock, ID de tracking.\n" +
    "- Les noms de produits restent dans leur langue d'origine (ne traduis PAS les noms de produits).\n" +
    "- Réponds dans la langue de l'utilisateur.\n" +
    "\n## DÉLÉGATION INTELLIGENTE (ORCHESTRATEUR)\n" +
    "- Tu es le chef d'orchestre. Tu reçois TOUTES les demandes en premier.\n" +
    "- Pour les tâches SIMPLES (salut, traduction, météo, question factuelle): réponds DIRECTEMENT, ne délègue pas.\n" +
    "- Pour les tâches COMPLEXES (code, analyse technique, raisonnement long, comparaison, image+question): utilise delegateToExpert.\n" +
    "- tier='small' pour les sous-tâches simples que tu ne peux pas faire (ex: traduction spécialisée).\n" +
    "- tier='medium' pour le raisonnement modéré (ex: analyse de texte, résumé complexe).\n" +
    "- tier='large' pour les tâches difficiles (ex: code complexe, analyse d'image technique, résolution de problème).\n" +
    "- Après réception du résultat expert, SYNTHÉTISE-le dans la langue de l'utilisateur. Ne recopie pas brut.\n" +
    "- Tu peux appeler delegateToExpert PLUSIEURS FOIS pour diviser une tâche complexe en sous-tâches.\n" +
    "\n## COMMANDES SLASH DU BOT (CONNAISSANCE COMPLÈTE)\n" +
    "Le bot dispose de nombreuses commandes slash que les utilisateurs peuvent utiliser directement. " +
    "Quand un utilisateur te demande ce que le bot peut faire, ou cherche une fonctionnalité, oriente-le vers la bonne commande.\n\n" +
    "### MODÉRATION & SÉCURITÉ\n" +
    "- `/mod` — Modération: warn, kick, ban, mute, timeout, clear, purge, history, nuke, snipe, config\n" +
    "- `/security` — Sécurité: osint, audit, shadow, config, antiraid, verif, blacklist\n" +
    "- `/modadmin` — Admin modération avancée: mass-move, voice-kick, raid-shield, ban-log, behavior-timeline, alt-link\n" +
    "- `/alert` — Alertes: rules, ack, digest, test, alertcenter, alertconfig\n" +
    "- `/casier` — Casier judiciaire: view, clear (aussi via clic droit sur un utilisateur)\n" +
    "- `/killswitch` — Arrêt d'urgence du bot (admin only)\n\n" +
    "### IA & ASSISTANT\n" +
    "- `/ai` — IA: chat, image (génération/analyse), translate, config, channel-summary, suggest, mood\n" +
    "- Tu ES l'agent IA — les utilisateurs peuvent aussi juste te @mentionner ou t'envoyer un DM\n\n" +
    "### GAMING\n" +
    "- `/game` — Gaming: track, news, free-games, steam, deals, price-compare, price-track, wishlist, boutique\n" +
    "- `/fnbot` — Fortnite Party Bot: login, status, cosmetics, shop\n" +
    "- `/mc` — Minecraft Bedrock Bot: start, stop, status, players\n" +
    "- `/game2` — Gaming étendu: xbox, twitch, psn, profile\n" +
    "- `/track` — Tracking de jeux: track-game, untrack-game, list-tracked\n" +
    "- `/releases` — Calendrier des sorties de jeux à venir\n" +
    "- `/trending` — Jeux les plus attendus\n" +
    "- `/gameupdates` — Mises à jour Steam news\n" +
    "- `/stream` — Contrôle Go Live\n\n" +
    "### RETAILER TRACKING (SUIVI DE PRODUITS)\n" +
    "- `/track-retailer` — Suivi produits revendeurs: add, scan, remove, list, search\n" +
    "- Revendeurs supportés: Amazon, eBay, Fnac, Cdiscount, etc.\n" +
    "- Alertes automatiques: prix, restock, promotions\n" +
    "- Fonctionne en DM ET sur serveur\n\n" +
    "### COMMUNAUTÉ & FUN\n" +
    "- `/community` — Communauté: profile, member-count, roles, birthday-config\n" +
    "- `/fun` — Fun: poll, joke, meme, dog, trivia, quote, advice, fortune, roast, compliment\n" +
    "- `/music` — Musique: play, stop, pause, skip, queue, volume, radio\n" +
    "- `/tools` — Outils: recherche, mp3, tts, vocal, embed-builder, screenshot, qr-code\n\n" +
    "### GESTION & CONFIG\n" +
    "- `/admin` — Admin: config, database, roles, permissions, backup, maintenance, broadcast, dm\n" +
    "- `/bot` — Bot: help, status, uptime, dashboard, restart, hotreload, debug, bot-health\n" +
    "- `/manage` — Gestion: roles, channels, emojis, autothread, customcmd\n" +
    "- `/config` — Configuration du bot (guild-specific)\n" +
    "- `/sources` — Sources RSS/Reddit: add, remove, list, health, rss-test\n" +
    "- `/ticket` — Système de tickets: setup, close, transcript\n" +
    "- `/autothread` — Threads automatiques\n" +
    "- `/customcmd` — Commandes personnalisées\n" +
    "- `/follow` — Suivi réseaux sociaux (YouTube, Twitter, etc.)\n\n" +
    "### UTILITAIRES\n" +
    "- `/help` — Aide générale\n" +
    "- `/commands` — Liste des commandes\n" +
    "- `/stats` — Statistiques du bot\n" +
    "- `/privacy` — RGPD: suppression de données\n" +
    "- `/debug` — Debug: api-status, bot-health, healthz\n\n" +
    "### CONTEXT MENUS (clic droit)\n" +
    "- 👤 Voir profil — Profil complet d'un utilisateur\n" +
    "- 📋 Voir casier — Casier judiciaire\n" +
    "- 🤖 Analyser IA — Analyse IA d'un utilisateur\n" +
    "- ⚠️ Risque score — Score de risque\n" +
    "- 🚩 Signaler — Signalement\n" +
    "- 🌐 Traduire — Traduction d'un message\n" +
    "- 📊 Analyser sentiment — Analyse de sentiment\n" +
    "- 📦 Extraire — Extraction de contenu\n" +
    "- 🔍 Snipe — Messages supprimés\n\n" +
    "### FONCTIONNALITÉS AUTOMATIQUES (sans commande)\n" +
    "- Surveillance YouTube/Twitter/Reddit en continu\n" +
    "- Alertes de sécurité automatiques (anti-raid, spam detection)\n" +
    "- Scraping de flux RSS et deals gaming\n" +
    "- Agent IA autonome (toi) qui répond aux @mentions et DMs\n" +
    "- Voice agent (surveillance vocale)\n" +
    "- Personality engine (John Helldiver)\n" +
    "- Circuit breaker (protection contre les pannes)\n" +
    "- Memory system (mémoire long terme des interactions)\n\n" +
    "### UTILISATION EN DM\n" +
    "- TOUTES les commandes slash fonctionnent en DM (message privé avec le bot)\n" +
    "- Les restrictions de permissions serveur ne s'appliquent pas en DM\n" +
    "- Les alertes retailer sont envoyées en DM en plus du salon d'alertes\n" +
    "- Les tools restreints (SSH, Docker, Kali) sont disponibles en DM (non en public)\n" +
    "- L'utilisateur peut te parler directement en DM sans @mention\n\n" +
    "\n## LISTE COMPLÈTE DES TOOLS DISPONIBLES (auto-générée)\n" +
    generateToolListPrompt(ALL_AGENT_TOOLS) +
    "\n\n" +
    (longTermMemory ? longTermMemory : "") +
    memoryPrompt +
    planPrompt +
    getApiKeyStatusLine() +
    (getToolHints(userMessage)
      ? "\n## Tools suggérés pour cette requête\n" + getToolHints(userMessage)
      : "") +
    (() => {
      const chains = suggestToolChain(userMessage);
      if (chains.length === 0) return "";
      return "\n## Enchaînement suggéré: " + chains.map((c) => c.join(" → ")).join(" | ") + "\n";
    })();

  let conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...channelHistory,
    { role: "user", content: `${message.author.username}: ${userMessage}` },
  ];

  // 2. Boucle Think → Act → Observe → Respond
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    logger.info(`[AgentLoop] 🔄 Itération ${iteration + 1}/${maxIterations}`);

    // ─── Context compression: after 1/3 of iterations, summarize tool results to save tokens ───
    const compressionIteration = Math.floor(maxIterations / 3);
    if (iteration === compressionIteration && conversation.length > 12) {
      const toolResults = conversation.filter((m) => m.role === "tool");
      if (toolResults.length > 3) {
        // Keep only the last 2 tool results, summarize older ones
        const oldToolResults = toolResults.slice(0, -2);
        const fullText = oldToolResults.map((m) => m.content).join("\n---\n");

        // Try intelligent summarization with Gemini, fall back to naive truncation
        let summary: string;
        if (isGeminiAvailable() && fullText.length > 200) {
          const geminiSummary = await summarizeWithGemini(fullText.slice(0, 8000), 300);
          summary = geminiSummary || oldToolResults.map((m) => m.content.slice(0, 100)).join(" | ");
        } else {
          summary = oldToolResults.map((m) => m.content.slice(0, 100)).join(" | ");
        }

        // Remove old tool messages and replace with a compact summary
        conversation = conversation.filter(
          (m) => m.role !== "tool" || toolResults.indexOf(m) >= oldToolResults.length,
        );
        // Insert summary as a system message
        conversation.push({
          role: "system",
          content: `[Résumé des tools précédents: ${summary.slice(0, 500)}]`,
        });
        logger.info(
          `[AgentLoop] 🗜️ Context compressed: ${oldToolResults.length} tool results → ${summary.length} chars (Gemini: ${isGeminiAvailable() && fullText.length > 200 ? "yes" : "no"})`,
        );
      }
    }

    // Circuit breaker: check if we can continue
    if (!recordLoop(breakerState, 800)) {
      // Breaker tripped — return immersive error
      const embed = createTrippedEmbed(breakerState);
      logger.warn(`[AgentLoop] 🚨 Circuit breaker tripped at iteration ${iteration + 1}`);
      return `${embed.data.title ?? "Circuit breaker activated"} — L'agent a dépassé la limite de sécurité. Réessaie ta demande.`;
    }

    let response: Awaited<ReturnType<typeof client.chat.completions.create>> | null = null;
    let lastErrMsg = "";

    // ─── Étape 1: Routeur intelligent — sélection du modèle selon la complexité ───
    const taskComplexity = classifyTaskComplexity(userMessage, availableTools.length);
    const modelChain = getModelChainForTask(taskComplexity);
    const preferredModel = getPersonalityModel(config.openRouterModel);

    // ─── Étape 1b: Routeur multi-modèles (code/vision override) ───
    const routedModel = getAgentLoopModel(userMessage);

    // Construire la liste des modèles à essayer:
    // 0. Modèle routé (code/vision) en première position si détecté
    // 1. Chaîne du routeur (triée par complexité)
    // 2. Modèle préféré en premier s'il est disponible
    // 3. Tous les modèles disponibles en fallback
    const allModels = getAllAvailableModels(availableTools.length > 0);
    const modelsToTry: string[] = [];

    // Modèle routé en priorité absolue
    if (routedModel && !modelsToTry.includes(routedModel)) {
      modelsToTry.push(routedModel);
    }
    // Mettre le modèle préféré en premier s'il est dans la chaîne ou dans allModels
    if (modelChain.includes(preferredModel) && !modelsToTry.includes(preferredModel)) {
      modelsToTry.push(preferredModel);
    }
    // Ajouter le reste de la chaîne du routeur
    for (const m of modelChain) {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    }
    // Ajouter les autres modèles disponibles non déjà inclus
    for (const m of allModels) {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    }

    logger.info(
      `[AgentLoop] 🧠 Task complexity: ${taskComplexity} | Models to try: ${modelsToTry.slice(0, 5).join(", ")}${modelsToTry.length > 5 ? ` (+${modelsToTry.length - 5} more)` : ""}`,
    );

    // ─── Étape 0: LLM local (Ollama/qwen) — PRIORITÉ ABSOLUE ───
    // qwen2.5 est le chef d'orchestre pour TOUT: texte, images, code, etc.
    // Pour les images: qwen reçoit la description Gemini Vision, puis peut
    // déléguer la réponse complexe via delegateToExpert si nécessaire.
    //
    // EXCEPTION: si la demande nécessite des tools retailer (tracking de produits),
    // on skip le local (qwen2.5:3b trop petit pour function calling complexe)
    // et on va directement sur les modèles API plus capables.
    const lowerUserMsg = userMessage.toLowerCase();
    const needsRetailerTools =
      lowerUserMsg.includes("track") || lowerUserMsg.includes("tracker") ||
      lowerUserMsg.includes("suivre") || lowerUserMsg.includes("pister") ||
      lowerUserMsg.includes("surveille") || lowerUserMsg.includes("alerte") ||
      lowerUserMsg.includes("prix") || lowerUserMsg.includes("price") ||
      lowerUserMsg.includes("produit") || lowerUserMsg.includes("product") ||
      lowerUserMsg.includes("amazon") || lowerUserMsg.includes("ebay") ||
      lowerUserMsg.includes("fnac") || lowerUserMsg.includes("cdiscount") ||
      lowerUserMsg.includes("deal") || lowerUserMsg.includes("promo") ||
      lowerUserMsg.includes("compar") || lowerUserMsg.includes("boutique") ||
      lowerUserMsg.includes("revendeur") || lowerUserMsg.includes("retailer") ||
      lowerUserMsg.includes("stock") || lowerUserMsg.includes("dispo") ||
      lowerUserMsg.includes("panier") || lowerUserMsg.includes("cart");
    const hasRetailerToolAvailable = availableTools.some(
      (t) => t.function.name === "searchRetailers" || t.function.name === "searchSingleRetailer" ||
             t.function.name === "trackRetailerProduct" || t.function.name === "compareProductPrices" ||
             t.function.name === "getRetailerDeals" || t.function.name === "listAvailableRetailers",
    );
    const skipLocalForRetailer = needsRetailerTools && hasRetailerToolAvailable;

    if (isLocalLlmAvailable() && !skipLocalForRetailer) {
      // Seuil de complexité: si >2 tools et complexité "moderate"/"complex",
      // on essaie quand même le local mais on accepte de fallback plus vite
      const isComplexTask = (taskComplexity === "moderate" || taskComplexity === "complex") && availableTools.length > 3;

      logger.info(`[AgentLoop] 🏠 Tentative LLM local: ${LOCAL_LLM_MODEL_NAME} (complexité: ${taskComplexity}, tools: ${availableTools.length}${isComplexTask ? " — tâche complexe, fallback rapide si échec" : ""})`);

      try {
        if (availableTools.length > 0) {
          // Tâche avec tools — essayer le local avec tools
          const localResult = await chatWithLocalLlmTools(
            conversation.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) })),
            availableTools,
            { maxTokens: getPersonalityMaxTokens(), temperature: getPersonalityTemperature() },
          );
          if (localResult) {
            if (localResult.toolCalls && localResult.toolCalls.length > 0) {
              // Le local a retourné des tool calls — construire la réponse
              response = {
                choices: [{
                  message: {
                    role: "assistant",
                    content: localResult.text || "",
                    tool_calls: localResult.toolCalls as never,
                  },
                  finish_reason: "tool_calls",
                }],
              } as never;
              logger.info(`[AgentLoop] ✅ ${LOCAL_LLM_MODEL_NAME} réussi (tools) — ${localResult.toolCalls.length} tool call(s)`);
              continue; // Passer à l'exécution des tools
            } else if (localResult.text && localResult.text.length > 5) {
              // Réponse texte simple — pas besoin de tools
              response = {
                choices: [{
                  message: { role: "assistant", content: localResult.text },
                  finish_reason: "stop",
                }],
              } as never;
              logger.info(`[AgentLoop] ✅ ${LOCAL_LLM_MODEL_NAME} réussi (texte, ${localResult.text.length} chars) — API économisée`);
              recordLocalLlm();
              break;
            } else if (!isComplexTask) {
              // Réponse courte mais tâche simple — acceptable
              if (localResult.text) {
                response = {
                  choices: [{
                    message: { role: "assistant", content: localResult.text },
                    finish_reason: "stop",
                  }],
                } as never;
                logger.info(`[AgentLoop] ✅ ${LOCAL_LLM_MODEL_NAME} réussi (réponse courte, tâche simple)`);
                recordLocalLlm();
                break;
              }
            }
            // Si tâche complexe et réponse vide/courte → fallback vers API
            logger.warn(`[AgentLoop] ⚠️ ${LOCAL_LLM_MODEL_NAME} réponse insuffisante pour tâche ${isComplexTask ? "complexe" : "simple"} — fallback API`);
          } else {
            logger.warn(`[AgentLoop] ⚠️ ${LOCAL_LLM_MODEL_NAME} retour null — fallback API`);
          }
        } else {
          // Pas de tools — chat simple, le local est parfait pour ça
          const localText = await chatWithLocalLlm(
            conversation.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) })),
            { maxTokens: getPersonalityMaxTokens(), temperature: getPersonalityTemperature() },
          );
          if (localText && localText.length > 2) {
            response = {
              choices: [{
                message: { role: "assistant", content: localText },
                finish_reason: "stop",
              }],
            } as never;
            logger.info(`[AgentLoop] ✅ ${LOCAL_LLM_MODEL_NAME} réussi (chat simple, ${localText.length} chars) — API économisée`);
            recordLocalLlm();
            break;
          }
          logger.warn(`[AgentLoop] ⚠️ ${LOCAL_LLM_MODEL_NAME} échec chat simple — fallback API`);
        }
      } catch (localErr) {
        const isTimeout = localErr instanceof Error && localErr.message.includes("timeout");
        if (isTimeout && isLocalLlmAvailable()) {
          // Retry once with reduced context (last 2 messages only)
          logger.info(`[AgentLoop] 🔄 Retry ${LOCAL_LLM_MODEL_NAME} avec contexte réduit...`);
          try {
            const reducedMessages = conversation.slice(-2).map((m) => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500),
            }));
            const retryText = await chatWithLocalLlm(reducedMessages, {
              maxTokens: 300,
              temperature: 0.5,
            });
            if (retryText && retryText.length > 2) {
              response = {
                choices: [{
                  message: { role: "assistant", content: retryText },
                  finish_reason: "stop",
                }],
              } as never;
              logger.info(`[AgentLoop] ✅ ${LOCAL_LLM_MODEL_NAME} réussi après retry (contexte réduit, ${retryText.length} chars) — API économisée`);
              recordLocalLlm();
              break;
            }
          } catch {
            // Give up, fall through to API
          }
        }
        logger.warn(`[AgentLoop] ❌ LLM local échoué: ${localErr instanceof Error ? localErr.message : String(localErr)}`);
      }
    } else if (skipLocalForRetailer) {
      // Local LLM skippé pour tâche retailer — on va directement aux API models
      logger.info(`[AgentLoop] 🏠⏭️ LLM local skippé (retailer tools nécessaires) — utilisation API directement`);
    } else {
      // Ollama non disponible — on log et on passe directement aux API
      logger.info(`[AgentLoop] 🏠 LLM local non disponible — utilisation API directement`);
    }

    for (const modelName of modelsToTry.slice(0, 5)) {
      try {
        logger.info(`[AgentLoop] 🎯 Tentative modèle: ${modelName}`);
        // Use OpenAI premium client for gpt-* models, NVIDIA NIM client for nvidia models, OpenRouter for the rest
        const isGptModel = modelName.startsWith("gpt-");
        const isNvidia = isNvidiaModel(modelName);
        const activeClient =
          isGptModel && isOpenAIPremiumAvailable() ? getOpenAIPremiumClient()! :
          isNvidia && isNvidiaNimAvailable() ? getNvidiaNimClient()! :
          client;
        response = await callLlmWithRetry(
          activeClient,
          {
            model: modelName,
            messages: conversation as never,
            tools: availableTools as never,
            max_tokens: getPersonalityMaxTokens(),
            temperature: getPersonalityTemperature(),
            parallel_tool_calls: true,
            stream: false,
          },
          { timeout: 8_000 },
        );
        markModelSuccess(modelName);
        agentModelUsed.labels(modelName, "success").inc();
        logger.info(`[AgentLoop] ✅ ${modelName} réussi`);
        recordApiLlm();
        break; // Succès → on sort de la boucle de rotation
      } catch (modelErr) {
        const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
        const isRateLimit = msg.includes("429") || msg.includes("rate");
        // 404/400/402 = modèle invalide ou credits insuffisants, pas un vrai échec — ne pas mettre en cooldown
        const isInvalidModel = msg.includes("404") || msg.includes("400") || msg.includes("is not a valid model") || msg.includes("402") || msg.includes("more credits");
        if (!isInvalidModel) {
          markModelFailure(modelName, isRateLimit);
        }
        agentModelUsed.labels(modelName, "fail").inc();
        lastErrMsg = msg;
        logger.warn(`[AgentLoop] ❌ ${modelName} échoué: ${msg.slice(0, 100)}`);
        // Continue au prochain modèle
      }
    }

    // ─── Étape 2: Fallback Groq si tous les modèles OpenRouter ont échoué ───
    if (!response && isGroqAvailable()) {
      try {
        logger.warn(
          `[AgentLoop] Tous modèles OpenRouter épuisés — fallback Groq (${config.groqModel})`,
        );
        const groqClient = getGroqClient()!;
        response = await groqClient.chat.completions.create(
          {
            model: config.groqModel,
            messages: conversation as never,
            tools: availableTools as never,
            max_tokens: getPersonalityMaxTokens(),
            temperature: getPersonalityTemperature(),
            parallel_tool_calls: true,
            stream: false,
          } as never,
          { timeout: 15_000 } as never,
        );
        logger.info(`[AgentLoop] ✅ Groq fallback réussi`);
      } catch (groqErr) {
        const groqErrMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
        logger.error(`[AgentLoop] Groq fallback also failed: ${groqErrMsg}`);
        lastErrMsg = groqErrMsg;
      }
    }

    // ─── Étape 2b: Fallback Gemini si OpenRouter + Groq ont échoué ───
    if (!response && isGeminiAvailable()) {
      try {
        logger.warn(`[AgentLoop] Tous modèles épuisés — fallback Gemini (texte seul, sans tools)`);
        const geminiReply = await chatWithGemini(
          config.aiSystemPrompt + "\n\nTu es John Helldiver. Réponds dans la langue du message reçu. Sois concis et naturel.",
          userMessage,
          800,
        );
        if (geminiReply) {
          // Gemini ne supporte pas les tools ici — on retourne directement la réponse
          logger.info(`[AgentLoop] ✅ Gemini fallback réussi`);
          completeInteraction(breakerState);
          return geminiReply;
        }
      } catch (geminiErr) {
        const geminiErrMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        logger.error(`[AgentLoop] Gemini fallback also failed: ${geminiErrMsg}`);
        lastErrMsg = geminiErrMsg;
      }
    }

    // ─── Étape 3: Tous les fallbacks ont échoué ───
    if (!response) {
      completeInteraction(breakerState);
      if (lastErrMsg.includes("429") || lastErrMsg.includes("rate")) {
        return "Le serveur IA est sous forte charge en ce moment, soldat. Réessaie dans quelques secondes.";
      }
      if (
        lastErrMsg.includes("timeout") ||
        lastErrMsg.includes("ECONNRESET") ||
        lastErrMsg.includes("fetch")
      ) {
        return "Problème de communication avec le serveur IA. La liaison a été perdue — réessaie ta demande.";
      }
      return "Le serveur IA a rencontré un problème temporaire. Réessaie ta demande, soldat.";
    }

    const choice = (
      response as {
        choices: Array<{ message: { content: string | null; tool_calls?: unknown[] } }>;
      }
    ).choices[0];
    if (!choice) break;

    const assistantMessage = choice.message;

    // ─── Cognitive Loop Engine: check for stasis before consuming tool tokens ───
    const thoughtContent = (assistantMessage.content || "").trim();
    if (thoughtContent.length > 10 && iteration > 0) {
      try {
        const stasisResult = await checkCognitiveStasis(
          cognitiveSessionId,
          iteration,
          thoughtContent,
        );
        if (stasisResult.stasisDetected && stasisResult.matchedIterations) {
          logger.warn(
            `[AgentLoop] 🧠 Cognitive stasis at iteration ${iteration + 1} — routing to reflector`,
          );

          // Short-circuit: route to reflector with STRATEGY_STEREOTYPY_DETECTED
          const stasisReflection = await reflectOnStasis(
            userMessage,
            stasisResult.thought,
            stasisResult.matchedIterations,
            stasisResult.maxSimilarity,
          ).catch((): import("./agentReflector.js").ReflectionResult => ({
            action: "pivot" as const,
            reasoning:
              "STRATEGY_STEREOTYPY_DETECTED: Forcing strategy mutation due to cognitive loop.",
            confidence: 0.7,
            stereotypyDetected: true,
            alternative_tool: undefined,
          }));

          if (stasisReflection.action === "abort") {
            // Ask user for clarification
            agentCognitiveStasis.labels("abort").inc();
            completeInteraction(breakerState);
            agentLoopIterations.observe(iteration + 1);
            agentLoopDuration.observe((Date.now() - loopStartTime) / 1000);
            purgeCognitiveSession(cognitiveSessionId);
            return `🧠 J'ai détecté que je tournais en rond sur ce problème. ${stasisReflection.reasoning}\n\nPeux-tu reformuler ou préciser ta demande ?`;
          }

          // action === "pivot": inject strategy mutation into conversation and continue
          agentCognitiveStasis.labels("pivot").inc();
          conversation.push({
            role: "system",
            content:
              `[STRATEGY_STEREOTYPY_DETECTED] L'approche actuelle est stéréotypée (similarité ${stasisResult.maxSimilarity.toFixed(4)}). ` +
              `Change radicalement de stratégie. ${stasisReflection.alternative_tool ? `Utilise plutôt: ${stasisReflection.alternative_tool}.` : "Essaie un tool ou une approche complètement différent."} ` +
              `Ne répète PAS la même séquence d'outils. Raisonnement: ${stasisReflection.reasoning}`,
          });
          logger.info(`[AgentLoop] 🔄 Strategy pivot injected — continuing with mutated approach`);
          continue; // Skip tool execution for this iteration, let LLM rethink
        }
      } catch (cogErr) {
        // Cognitive engine should never crash the agent loop
        logger.debug(
          `[AgentLoop] Cognitive engine error (non-fatal): ${cogErr instanceof Error ? cogErr.message : String(cogErr)}`,
        );
      }
    } else if (thoughtContent.length > 10) {
      // First iteration — just record the thought without stasis check
      try {
        await checkCognitiveStasis(cognitiveSessionId, iteration, thoughtContent);
      } catch {
        // Silent — never crash the loop
      }
    }

    // Si l'IA n'a pas demandé d'outil → c'est la réponse finale
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      const finalReply = assistantMessage.content || "*(silence)*";
      logger.info(`[AgentLoop] ✅ Réponse finale (itération ${iteration + 1})`);
      logStatsSummary();
      completeInteraction(breakerState);
      agentLoopIterations.observe(iteration + 1);
      agentLoopDuration.observe((Date.now() - loopStartTime) / 1000);

      // ─── MODULE B: Stocker en mémoire vectorielle ───
      storeMemory(message.author.id, message.guildId || "", userMessage, "user");
      storeMemory(message.author.id, message.guildId || "", finalReply, "assistant");
      void persistMemoryToDb(message.author.id, message.guildId || "").catch(() => {});

      // ─── MODULE B1: Persister la conversation en DB (survivre au redémarrage) ───
      void prisma.chatHistory
        .createMany({
          data: [
            {
              channelId: message.channelId,
              userId: message.author.id,
              guildId: message.guildId || null,
              role: "user" as never,
              content: userMessage.slice(0, 2000),
            },
            {
              channelId: message.channelId,
              userId: message.author.id,
              guildId: message.guildId || null,
              role: "assistant" as never,
              content: finalReply.slice(0, 2000),
            },
          ],
        })
        .catch(() => {});

      // ─── MODULE B2: Mettre en cache sémantique ───
      cacheResponse(userMessage, finalReply, cacheCtx);

      // ─── MODULE C: Reset retry state ───
      resetRetries(breakerState.interactionId);

      // ─── Cognitive Loop Engine: purge on success ───
      purgeCognitiveSession(cognitiveSessionId);

      return finalReply;
    }

    // L'IA a demandé un ou plusieurs outils → on les exécute en parallèle
    conversation.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: assistantMessage.tool_calls,
    });

    // Exécuter tous les tools en parallèle pour la performance
    const toolCalls = (assistantMessage.tool_calls ?? []) as Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;

    // Notify status indicator (if provided) about tool calls
    if (statusCallback && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        statusCallback(tc.function.name, iteration);
      }
    }

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const tc = toolCall;
        const toolName = tc.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          logger.warn(`[AgentLoop] Args invalides pour ${toolName}: ${tc.function.arguments}`);
        }

        let result;
        try {
          // Auto-disable check: skip tools that have been failing repeatedly
          if (isToolDisabled(toolName)) {
            logger.info(`[AgentLoop] ⏭️ Tool ${toolName} skipped (auto-disabled)`);
            result = {
              success: false,
              data: `Tool ${toolName} temporairement indisponible (trop d'erreurs récentes). Réessaie plus tard.`,
            };
          } else if (isToolRateLimited(toolName)) {
            logger.info(`[AgentLoop] 🚦 Tool ${toolName} skipped (global rate limit)`);
            result = {
              success: false,
              data: `Tool ${toolName} temporairement limité (trop d'appels récents). Réessaie dans 1 minute.`,
            };
          } else {
            // ─── Tool result cache: skip API call if cached result is fresh ───
            if (isToolCacheable(toolName)) {
              const cached = getCachedToolResult(toolName, args);
              if (cached !== null) {
                logger.info(`[AgentLoop] 📦 Tool cache hit: ${toolName}`);
                result = { success: true, data: cached };
                agentCacheHits.inc();
                agentToolCalls.labels(toolName, "success").inc();
                agentToolCallsDaily.labels(toolName).inc();
                // Skip actual execution — use cached result
                // Continue to tool result processing below
              } else {
                agentCacheMisses.inc();
              }
            }

            if (result === null || result === undefined) {
              // ─── Orchestrateur: qwen2.5 délègue à un modèle expert ───
              if (toolName === "delegateToExpert") {
                logger.info(`[AgentLoop] 🎼 Délégation orchestrateur: tier=${args.tier}, tâche=${String(args.task).slice(0, 60)}...`);
                try {
                  const expertResult = await delegateToExpert(
                    String(args.task),
                    (args.tier as "small" | "medium" | "large") || "medium",
                    String(args.context || userMessage),
                  );
                  result = { success: true, data: expertResult };
                  agentToolCalls.labels("delegateToExpert", "success").inc();
                  agentToolCallsDaily.labels("delegateToExpert").inc();
                  recordDelegation();
                } catch (delErr) {
                  result = {
                    success: false,
                    data: `Délégation échouée: ${delErr instanceof Error ? delErr.message : String(delErr)}`,
                  };
                  agentToolCalls.labels("delegateToExpert", "fail").inc();
                }
              } else if (isLowRisk(toolName)) {
                logger.info(`[AgentLoop] ⚡ Autonomous execution (low-risk): ${toolName}`);
                result = await executeTool(toolName, args, ctx);
                if (result.success) {
                  recordToolSuccess(toolName);
                  agentToolCalls.labels(toolName, "success").inc();
                  agentToolCallsDaily.labels(toolName).inc();
                  if (isToolCacheable(toolName)) {
                    setCachedToolResult(toolName, args, result.data);
                  }
                } else {
                  recordToolFailure(toolName);
                  agentToolCalls.labels(toolName, "fail").inc();
                  agentToolCallsDaily.labels(toolName).inc();
                }
              } else if (isRestrictedTool(toolName)) {
                // Medium/high risk — SOAR gate required
                const risk = getRiskLevel(toolName) ?? "unclassified";
                logger.info(`[AgentLoop] 🛡️ SOAR Gate required (risk: ${risk}): ${toolName}`);
                const approved = await requestToolApproval(toolName, args, message.author.id);
                if (!approved) {
                  logger.warn(
                    `[AgentLoop] 🛡️ SOAR Gate: ${toolName} BLOCKED — admin rejected or timeout`,
                  );
                  result = {
                    success: false,
                    data: `Outil ${toolName} bloqué par la porte de validation SOAR. L'administrateur a rejeté ou n'a pas répondu à temps.`,
                  };
                  recordToolFailure(toolName);
                  agentToolCalls.labels(toolName, "fail").inc();
                  agentToolCallsDaily.labels(toolName).inc();
                } else {
                  logger.info(
                    `[AgentLoop] ✅ SOAR Gate: ${toolName} APPROVED by admin — executing`,
                  );
                  result = await executeTool(toolName, args, ctx);
                  if (result.success) {
                    recordToolSuccess(toolName);
                    agentToolCalls.labels(toolName, "success").inc();
                    agentToolCallsDaily.labels(toolName).inc();
                  } else {
                    recordToolFailure(toolName);
                    agentToolCalls.labels(toolName, "fail").inc();
                    agentToolCallsDaily.labels(toolName).inc();
                  }
                }
              } else {
                // Unclassified tools — default to direct execution (backward compat)
                result = await executeTool(toolName, args, ctx);
                if (result.success) {
                  recordToolSuccess(toolName);
                  agentToolCalls.labels(toolName, "success").inc();
                  agentToolCallsDaily.labels(toolName).inc();
                  // Cache successful results for cacheable tools
                  if (isToolCacheable(toolName)) {
                    setCachedToolResult(toolName, args, result.data);
                  }
                } else {
                  recordToolFailure(toolName);
                  agentToolCalls.labels(toolName, "fail").inc();
                  agentToolCallsDaily.labels(toolName).inc();
                }
              }
            }
          }
        } catch (toolErr) {
          const toolErrMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          logger.warn(`[AgentLoop] Tool ${toolName} crashed: ${toolErrMsg}`);
          recordToolFailure(toolName);
          result = { success: false, data: `Erreur interne (tool ${toolName}). Réessaie.` };
        }
        logger.info(
          `[AgentLoop] 🔧 ${toolName} → ${result.success ? "OK" : "FAIL"}: ${String(result.data ?? "").slice(0, 100)}`,
        );

        // ─── MODULE C: Auto-réflexion sur le résultat du tool ───
        const toolExecResult: ToolExecutionResult = {
          toolName,
          success: result.success,
          data: String(result.data ?? ""),
          args,
        };
        let reflection;
        try {
          reflection = await reflectOnToolResult(userMessage, toolExecResult, iteration);
        } catch (reflectErr) {
          logger.warn(
            `[AgentLoop] Reflection failed for ${toolName}: ${reflectErr instanceof Error ? reflectErr.message : String(reflectErr)}`,
          );
          reflection = { action: "continue" as const, reasoning: undefined };
        }

        if (reflection.action === "retry" || reflection.action === "retry_different") {
          const retryArgs = reflection.corrected_args || args;
          logger.info(
            `[AgentLoop] 🔄 Retrying ${toolName} (${reflection.action}): ${reflection.reasoning?.slice(0, 80)}`,
          );
          const retryResult = await executeTool(toolName, retryArgs, ctx);
          logger.info(
            `[AgentLoop] 🔧 ${toolName} retry → ${retryResult.success ? "OK" : "FAIL"}: ${retryResult.data.slice(0, 100)}`,
          );
          return {
            tool_call_id: tc.id,
            content:
              retryResult.data +
              (reflection.reasoning ? `\n[Reflexion: ${reflection.reasoning}]` : ""),
          };
        }

        if (reflection.action === "abort") {
          logger.warn(`[AgentLoop] 🛑 Aborting ${toolName}: ${reflection.reasoning}`);
          return {
            tool_call_id: tc.id,
            content: `Tool ${toolName} abandonné: ${reflection.reasoning}`,
          };
        }

        return {
          tool_call_id: tc.id,
          content: result.data,
        };
      }),
    );

    // Renvoyer tous les résultats à l'IA (Observe)
    for (const result of toolResults) {
      conversation.push({
        role: "tool",
        tool_call_id: result.tool_call_id,
        content: String(result.content ?? ""),
      });
    }

    // La boucle continue : l'IA va recevoir les résultats des tools
    // et soit demander d'autres tools, soit formuler sa réponse finale
  }

  // Si on a épuisé les itérations, retourner la dernière réponse
  logger.warn(`[AgentLoop] ⚠️ Max iterations (${maxIterations}) atteint`);
  agentLoopMaxedOut.inc();
  tripBreaker(breakerState, `Max iterations (${maxIterations}) reached without final reply`);
  purgeCognitiveSession(cognitiveSessionId);
  return "J'ai analysé la situation mais j'ai besoin de plus de contexte pour répondre. Peux-tu préciser ?";
}

// ─── Sauvegarde automatique en mémoire ───────────────────────────────────────

/**
 * Après une conversation, l'IA peut extraire des faits à mémoriser.
 * Cette fonction demande à l'IA de résumer les points clés à retenir.
 */
export async function extractAndSaveMemory(
  userId: string,
  userMessage: string,
  aiResponse: string,
): Promise<void> {
  try {
    const client = getOpenAIClient();

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu extrais les faits importants à mémoriser sur un utilisateur. " +
              'Réponds en JSON : {"facts": [{"key": "...", "value": "...", "category": "..."}]}. ' +
              'Si rien à mémoriser, réponds {"facts": []}.',
          },
          {
            role: "user",
            content: `User: ${userMessage}\nAI: ${aiResponse}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      },
      { timeout: 10_000 },
    );

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]) as {
      facts?: Array<{ key: string; value: string; category?: string }>;
    };

    if (!parsed.facts || parsed.facts.length === 0) return;

    // S'assurer que UserMemory existe
    await prisma.userMemory.upsert({
      where: { userId },
      create: { userId },
      update: { lastActiveAt: new Date() },
    });

    for (const fact of parsed.facts.slice(0, 3)) {
      await prisma.memoryFact.upsert({
        where: { userId_key: { userId, key: fact.key } },
        create: {
          userId,
          key: fact.key,
          value: fact.value,
          category: fact.category || "auto",
        },
        update: {
          value: fact.value,
          category: fact.category || "auto",
          updatedAt: new Date(),
        },
      });
    }

    logger.info(`[AgentLoop] 💾 ${parsed.facts.length} faits sauvegardés pour ${userId}`);
  } catch (error) {
    // Non-critique — la mémoire est optionnelle
    logger.debug(
      `[AgentLoop] Extraction mémoire échouée: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
