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
import { callLlm } from "./aiGateway.js";
import { isErrorResponse } from "./responseClassifier.js";
import {
  markModelSuccess,
  recordModelLatency,
  isModelAvailable,
  getAllAvailableModels,
  ensureAtLeastOneModelAvailable,
} from "./modelRotation.js";
import { sanitizeForLlm } from "../utils/promptSanitizer.js";
import { classifyTaskComplexity, getModelChainForTask } from "./taskModelRouter.js";
import {
  ALL_AGENT_TOOLS,
  executeTool,
  generateToolListPrompt,
  type ToolContext,
  type AgentToolDef,
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
} from "./agentToolRouter.js";
import { isRestrictedTool, requestToolApproval } from "./agentSoarGate.js";
import { isLowRisk, getRiskLevel } from "./toolRiskRegistry.js";
import { getFeedbackHints } from "./proactiveAgent.js";
import { getAgentLoopModel } from "./modelRouter.js";
import { getCustomInstructions } from "./customInstructions.js";
import { summarizeWithGemini, isGeminiAvailable } from "./gemini.js";
import {
  isLocalLlmAvailable,
  isLocalLlmVisionAvailable,
  getLocalLlmVisionModelName,
  chatWithLocalLlm,
  LOCAL_LLM_MODEL_NAME,
} from "./localLlm.js";
import { recordLocalLlm, recordApiLlm, recordDelegation, logStatsSummary } from "./llmStats.js";
import { isKilled } from "./killSwitch.js";
import { detectLanguage, getNativeName, getFlag } from "../utils/languageDetector.js";
import {
  buildPersonalitySystemPrompt,
  getPersonalityModel,
  getPersonalityTemperature,
  getPersonalityMaxTokens,
} from "../infrastructure/middleware/personalityMiddleware.js";
import { getCachedResponse, cacheResponse } from "./aiCache.js";
import { getCachedToolResult, setCachedToolResult, isToolCacheable } from "./toolResultCache.js";
import { getTrivialResponse } from "./trivialFastPath.js";
import {
  loadUserFacts,
  loadUserNotes,
  searchKnowledge,
  appendUserFact,
  searchQA,
  saveQA,
} from "./obsidianMemory.js";
import {
  getUserPreferences,
  recordInteraction,
  formatPreferencesForPrompt,
  setUserLanguage,
} from "./userPreferences.js";
import { detectPrefetchableTool, formatPrefetchResult } from "./toolPrefetch.js";
import type { ChatRuntimeSignal } from "./chatRuntime.js";
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
const AGENT_LOOP_TIMEOUT_MS = 90_000; // 90s max for the entire agent loop
const AGENT_LOOP_TIMEOUT_LONG_MS = 180_000; // 180s for complex tasks

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
setInterval(
  () => {
    const now = Date.now();
    for (const [userId, lastCall] of userCooldowns.entries()) {
      if (now - lastCall > COOLDOWN_MS * 20) {
        userCooldowns.delete(userId);
      }
    }
  },
  5 * 60 * 1000,
).unref?.();

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
  tool_calls?: any;
}

type VisionContent = Array<
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "auto" } }
>;

type ProviderChatMessage = Omit<ChatMessage, "content"> & {
  content: string | VisionContent;
};

// ─── Compact tool definitions to reduce API payload ──────────────────────────
// Raccourcit les descriptions des tools à 60 chars pour réduire le payload
// envoyé à l'API. Avec 150+ tools, ça économise ~10K+ tokens.
// Aussi limite le nombre de tools à MAX_TOOLS pour éviter les erreurs 400
// (Groq: max 128 tools, OpenRouter: pas de limite officielle mais recommandé <200)
const MAX_TOOLS = 120;

function compactTools(tools: AgentToolDef[]): AgentToolDef[] {
  // Prioriser: tools essentiels d'abord, puis par ordre original
  const ESSENTIAL = new Set([
    "searchWeb",
    "readUrl",
    "fetchAndSummarize",
    "searchKnowledge",
    "getDateTime",
    "getWeather",
    "translateText",
    "execute_code",
    "send_message",
    "ask_user_question",
    "think_step_by_step",
    "delegate_to_expert",
    "analyzeImageGemini",
  ]);

  const essential = tools.filter((t) => ESSENTIAL.has(t.function.name));
  const rest = tools.filter((t) => !ESSENTIAL.has(t.function.name));
  const capped = [...essential, ...rest].slice(0, MAX_TOOLS);

  return capped.map((t) => ({
    type: "function" as const,
    function: {
      name: t.function.name,
      description: (t.function.description || "").slice(0, 60),
      parameters: t.function.parameters,
    },
  }));
}

function buildProviderConversation(
  conversation: ChatMessage[],
  imageUrls: string[],
): ProviderChatMessage[] {
  const safeImageUrls = imageUrls.filter((url) => /^https?:\/\//i.test(url)).slice(0, 5);
  if (safeImageUrls.length === 0) return conversation;

  let lastUserIndex = -1;
  for (let index = conversation.length - 1; index >= 0; index--) {
    if (conversation[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) return conversation;

  return conversation.map((entry, index) => {
    if (index !== lastUserIndex) return entry;
    return {
      ...entry,
      content: [
        { type: "text", text: entry.content },
        ...safeImageUrls.map((url) => ({
          type: "image_url" as const,
          image_url: { url, detail: "auto" as const },
        })),
      ],
    };
  });
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
    logger.error("[Silent catch]");
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
    logger.error("[Silent catch]");
  }

  // Deduplicate: keep only last MAX_HISTORY_MESSAGES * 2 entries
  const maxHistory = MAX_HISTORY_MESSAGES * 2;
  if (history.length > maxHistory) {
    return history.slice(-maxHistory);
  }

  // ─── Context compression: truncate old messages to save tokens ───
  // Les 3 messages les plus récents gardent leur contenu complet.
  // Les plus anciens sont tronqués à 200 chars pour réduire le context window.
  if (history.length > 6) {
    const recentCount = 3;
    const oldMessages = history.slice(0, -recentCount);
    const recentMessages = history.slice(-recentCount);
    const compressed = oldMessages.map((m) => ({
      role: m.role,
      content: m.content.length > 200 ? m.content.slice(0, 200) + " [...]" : m.content,
    }));
    return [...compressed, ...recentMessages];
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
  signal?: ChatRuntimeSignal,
  imageUrls: string[] = [],
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
  signal?.throwIfAborted();

  // ─── Fast-path: réponses triviales sans API ───
  const trivial = getTrivialResponse(userMessage, message.author.id);
  if (trivial) {
    activeAgentLoops.delete(message.author.id);
    return trivial;
  }

  try {
    const complex = isComplexTask(userMessage);
    const timeout = complex ? AGENT_LOOP_TIMEOUT_LONG_MS : AGENT_LOOP_TIMEOUT_MS;
    const maxIter = complex ? MAX_ITERATIONS_LONG_TASK : MAX_ITERATIONS;
    if (complex) {
      logger.info(
        `[AgentLoop] 🧠 Complex task detected — using ${maxIter} iterations, ${timeout / 1000}s timeout`,
      );
    }
    let abortCheck: ReturnType<typeof setInterval> | undefined;
    const abortPromise = signal
      ? new Promise<string>((_, reject) => {
          if (signal.aborted) {
            reject(new Error(signal.reason || "Chat request cancelled"));
            return;
          }
          abortCheck = setInterval(() => {
            if (signal.aborted) {
              if (abortCheck) clearInterval(abortCheck);
              reject(new Error(signal.reason || "Chat request cancelled"));
            }
          }, 100);
        })
      : new Promise<string>(() => {});

    try {
      return await Promise.race([
        runAgentLoopInternal(message, userMessage, statusCallback, maxIter, signal, imageUrls),
        new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error(`AgentLoop timeout (${timeout / 1000}s)`)), timeout);
        }),
        abortPromise,
      ]);
    } finally {
      if (abortCheck) clearInterval(abortCheck);
    }
  } finally {
    activeAgentLoops.delete(message.author.id);
  }
}

// ─── (callLlmWithRetry removed — aiGateway handles retries) ──────────────

async function runAgentLoopInternal(
  message: Message,
  userMessage: string,
  statusCallback?: (toolName: string, iteration: number) => void,
  maxIterations: number = MAX_ITERATIONS,
  signal?: ChatRuntimeSignal,
  imageUrls: string[] = [],
): Promise<string> {
  // Sanitize user input to prevent prompt injection (AGENTFLOW-001 / ASI01)
  userMessage = sanitizeForLlm(userMessage);
  if (isKilled()) {
    logger.warn("[AgentLoop] Kill switch is active — skipping agent loop");
    return "🔴 Le kill switch est activé. Les boucles autonomes sont suspendues. Utilise `/killswitch deactivate` pour reprendre.";
  }

  const ctx: ToolContext = {
    client: message.client as Client,
    message,
    userId: message.author.id,
    guildId: message.guildId || "",
    channelId: message.channelId,
  };

  // ─── MODULE 1: Circuit Breaker — track execution state ───
  const breakerState = beginInteraction(
    message.author.id,
    message.guildId || "",
    maxIterations > 8,
  );

  // ─── Cognitive Loop Engine — init embedding cache for this run ───
  const cognitiveSessionId = breakerState.interactionId;
  initCognitiveSession(cognitiveSessionId);

  // ─── MODULE 0a: Semantic cache check — skip API if we already answered this ───
  const cacheCtx = message.guildId || "dm";
  const loopStartTime = Date.now();
  const cached = getCachedResponse(userMessage, cacheCtx);
  if (cached && !isErrorResponse(cached)) {
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
    logger.info(
      `[AgentLoop] 🎼 Mode orchestrateur activé — qwen2.5 peut déléguer aux modèles experts`,
    );
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

  // 1. Construire le contexte (mémoire + historique + Obsidian) — en parallèle pour la perf
  const [longTermMemory, channelHistory, obsidianFacts, obsidianNotes, obsidianKnowledge, savedQA] =
    await Promise.all([
      loadLongTermMemory(message.author.id),
      loadChannelHistory(message),
      loadUserFacts(message.author.id),
      loadUserNotes(message.author.id),
      searchKnowledge(userMessage),
      searchQA(userMessage),
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

  // ─── Charger les préférences utilisateur (mémoire long-terme) ───
  const userPref = await getUserPreferences(message.author.id);
  void recordInteraction(message.author.id);
  // Auto-save langue détectée si différente de la préférence stockée
  if (langDetection.lang !== "fr" && userPref.language !== langDetection.lang) {
    void setUserLanguage(message.author.id, langDetection.lang);
  }

  const systemPrompt =
    buildPersonalitySystemPrompt(config.aiSystemPrompt) +
    `\n\n## LANGUE DE RÉPONSE (DÉTECTION AUTO)\n${langInstruction}\n` +
    "Si l'utilisateur change de langue en cours de conversation, adapte-toi immédiatement.\n" +
    formatPreferencesForPrompt(userPref) +
    "\n\nTu es John Helldiver, un agent IA autonome sur Discord. " +
    `Tu as accès à Internet et à ${availableTools.length} outils couvrant TOUS les domaines.\n` +
    "## CAPACITÉS INTERNET\n" +
    "- **searchWeb** : recherche web en temps réel (Brave Search)\n" +
    "- **readUrl** : lis et résume n'importe quelle page web\n" +
    "- **webcheck_scan** : analyse OSINT complète d'un site web (SSL, DNS, WHOIS, ports, tech-stack, menaces)\n" +
    "- **ip_ping / ip_portscan / dns_lookup** : outils réseau OSINT\n" +
    "- **searchYouTube / getWikipediaSummary** : recherche sur YouTube et Wikipedia\n" +
    "- **getWeather / getCryptoPrice** : données en temps réel\n" +
    "Tu PEUX et DOIS faire des recherches web quand l'utilisateur te demande des informations actuelles.\n\n" +
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
    `Tu as accès à ${availableTools.length} outils couvrant TOUS les domaines: modération Discord, recherche web, OSINT, sécurité, pentest (Kali Linux), forensique, data science, conversions, gaming, crypto, météo, multimédia, et plus.\n` +
    "La liste complète auto-générée est fournie à la fin de ce prompt — chaque tool y est listé avec sa description.\n" +
    "Utilise le bon tool selon le contexte. Si unsure, searchKnowledge en premier pour les questions techniques.\n\n" +
    "## RÈGLES\n" +
    "- Tu es le point d'entrée UNIQUE. L'utilisateur te @mention et tu fais TOUT.\n" +
    "- searchKnowledge EN PREMIER pour les questions techniques, puis searchWeb.\n" +
    "- fetchAndSummarize pour les liens. analyze_image pour les images. detect_language si non-français.\n" +
    "- Cite ta source (URL) si tu trouves une info sur le web.\n" +
    "- Sois concis, naturel, réponds en français. Enchaîne plusieurs tools si besoin.\n" +
    "- Si un tool échoue, utilise un autre tool ou réponds avec les informations dont tu disposes. Ta réponse doit toujours apporter de la valeur à l'utilisateur.\n" +
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
    "\n## DISTINCTION INTENTION vs ACTION — RÈGLE CRITIQUE\n" +
    "- AVANT de demander des précisions, DÉTERMINE si l'utilisateur:\n" +
    "  1. DEMANDE une ACTION réelle (ban, kick, mute, search, etc.) → alors demande les infos manquantes\n" +
    "  2. POSE une QUESTION sur tes CAPACITÉS (« tu peux ban ? », « tu sais faire X ? », « c'était pour savoir si tu peux ») → réponds DIRECTEMENT par oui/non + explication, SANS demander de cible\n" +
    "- Mots-clés indiquant une QUESTION de capacité: « est-ce que tu peux », « tu peux », « tu sais », « c'était pour savoir », « juste pour savoir », « si tu pouvais », « est-ce possible », « tu es capable de »\n" +
    "- Si l'utilisateur dit « c'était juste pour savoir » ou « pas pour vraiment le faire » → NE demande JAMAIS de cible, réponds directement\n" +
    "- EXEMPLE: « Tu peux ban des gens ? » → « Oui, je peux bannir. Utilise /mod ou mentionne-moi avec la commande. » (PAS de « Quel utilisateur ? »)\n" +
    "\n## RETAILER TRACKING\n" +
    "Quand l'utilisateur demande de tracker/suivre/pister un produit, UTILISE les tools retailer (searchRetailers, trackRetailerProduct, etc.).\n" +
    "Reconnais l'intention en FR/EN/DE/ES/IT/NL: track, suivre, pister, surveiller, alerte, promo, deal, comparer, panier.\n" +
    "- Image (panier/produit): analyse avec analyzeImageGemini → searchSingleRetailer + trackRetailerProduct.\n" +
    "- Produit + boutique: searchSingleRetailer(retailer, productName, country) → trackRetailerProduct.\n" +
    "- Produit seul: searchRetailers (toutes boutiques) → trackRetailerProduct sur le moins cher.\n" +
    "- Promo/deal: getRetailerDeals(retailer, country). Comparaison: compareProductPrices(productName, country).\n" +
    "- JAMAIS de message de limitation. Essaie d'abord, rapporte après. Réponds dans la langue de l'utilisateur.\n" +
    "\n## DÉLÉGATION INTELLIGENTE\n" +
    "- Tâches SIMPLES: réponds DIRECTEMENT.\n" +
    "- Tâches COMPLEXES (code, analyse, image+question): utilise delegateToExpert (tier='small|medium|large').\n" +
    "- Synthétise le résultat expert dans la langue de l'utilisateur.\n" +
    "\n## COMMANDES SLASH PRINCIPALES\n" +
    "Modération: /mod, /security, /casier, /alert, /killswitch\n" +
    "IA: /chat, /aichat, /smartpoll (ou @mention directe)\n" +
    "Gaming: /game, /mc, /mcmenu, /fnbot, /track, /releases, /stream\n" +
    "Retailer: /track-retailer (add, scan, list, search)\n" +
    "Fun: /fun, /music, /community\n" +
    "Admin: /admin, /bot, /manage, /config, /ticket\n" +
    "Utils: /help, /stats, /privacy, /debug\n" +
    "Context menus: clic droit → profil, casier, analyser IA, risque, signaler, traduire, sentiment\n" +
    "DM: toutes les commandes fonctionnent en DM. Tools restreints (SSH, Docker, Kali) en DM seulement.\n" +
    "\n## LISTE DES TOOLS DISPONIBLES (auto-générée)\n" +
    generateToolListPrompt(availableTools) +
    "\n\n" +
    (longTermMemory ? longTermMemory : "") +
    (obsidianFacts.length > 0
      ? "\n## Obsidian — Faits sur cet utilisateur\n" +
        obsidianFacts.map((f) => `- ${f.key}: ${f.value} #${f.category}`).join("\n") +
        "\n"
      : "") +
    (obsidianNotes ? "\n## Obsidian — Notes sur cet utilisateur\n" + obsidianNotes + "\n" : "") +
    (obsidianKnowledge.length > 0
      ? "\n## Obsidian — Base de connaissances\n" + obsidianKnowledge.join("\n\n") + "\n"
      : "") +
    (savedQA
      ? "\n## Obsidian — Question déjà répondue précédemment\n" +
        `**Question similaire déjà posée** (catégorie: ${savedQA.category}):\n` +
        `Q: ${savedQA.question}\n` +
        `R: ${savedQA.answer}\n` +
        "Tu peux réutiliser/adapter cette réponse si elle est toujours pertinente. " +
        "Si l'info est obsolète, vérifie avec tes tools et mets à jour.\n"
      : "") +
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

  // ─── Tool prefetch: pré-exécuter les tools évidents (météo, crypto, NASA) ───
  let prefetchContext = "";
  const prefetchTarget = detectPrefetchableTool(userMessage);
  if (prefetchTarget) {
    try {
      const { executeTool } = await import("./agentTools.js");
      const prefetchResult = await executeTool(prefetchTarget.toolName, prefetchTarget.args, {
        client: message.client,
        guildId: message.guildId ?? "",
        userId: message.author.id,
        channelId: message.channelId,
        message,
      });
      prefetchContext = `\n## RÉSULTAT PRÉ-EXÉCUTÉ (${prefetchTarget.toolName})\n${formatPrefetchResult(prefetchTarget.toolName, prefetchResult.data || JSON.stringify(prefetchResult))}\nTu n'as PAS besoin de rappeler ce tool — utilise directement ce résultat.\n`;
      logger.info(`[Prefetch] ✅ ${prefetchTarget.toolName} pré-exécuté avec succès`);
    } catch (err) {
      logger.debug(
        `[Prefetch] ❌ Échec ${prefetchTarget.toolName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  let conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt + prefetchContext },
    ...channelHistory,
    { role: "user", content: `${message.author.username}: ${userMessage}` },
  ];

  // 2. Boucle Think → Act → Observe → Respond
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    signal?.throwIfAborted();
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

    let response: {
      choices: Array<{
        message: { content: string | null; tool_calls?: any[] };
        finish_reason: string;
      }>;
    } | null = null;
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
    if (routedModel && isModelAvailable(routedModel) && !modelsToTry.includes(routedModel)) {
      modelsToTry.push(routedModel);
    }
    // Mettre le modèle préféré en premier s'il est dans la chaîne ou dans allModels
    if (
      modelChain.includes(preferredModel) &&
      isModelAvailable(preferredModel) &&
      !modelsToTry.includes(preferredModel)
    ) {
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

    // ─── Filtre retailer: écarter les petits modèles (<20B) pour les tâches retailer ───
    // Les petits modèles (7B, 8B, 3B) ne gèrent pas bien le function calling complexe
    const SMALL_MODEL_PATTERNS = [
      /-7b/i,
      /-8b/i,
      /-3b/i,
      /-3\.5b/i,
      /-9b/i,
      /-11b/i,
      /-12b/i,
      /phi-3/i,
      /zephyr/i,
      /openchat/i,
      /openhermes/i,
      /lfm-7b/i,
      /gemma-2-9b/i,
      /gemini-flash-1.5-8b/i,
      /gemini-2.0-flash-lite/i,
      /mistral-7b/i,
      /magmell-8b/i,
      /rocinante/i,
    ];
    let effectiveModels = modelsToTry;
    // Keep failover bounded but try enough models — we have 8+ NVIDIA models available
    let maxModelAttempts = 4;
    // Compute skipLocalForRetailer early (needed before local LLM attempt)
    const lowerUserMsgEarly = userMessage.toLowerCase();
    const needsRetailerToolsEarly =
      lowerUserMsgEarly.includes("track") ||
      lowerUserMsgEarly.includes("tracker") ||
      lowerUserMsgEarly.includes("suivre") ||
      lowerUserMsgEarly.includes("pister") ||
      lowerUserMsgEarly.includes("surveille") ||
      lowerUserMsgEarly.includes("alerte") ||
      lowerUserMsgEarly.includes("prix") ||
      lowerUserMsgEarly.includes("price") ||
      lowerUserMsgEarly.includes("produit") ||
      lowerUserMsgEarly.includes("product") ||
      lowerUserMsgEarly.includes("amazon") ||
      lowerUserMsgEarly.includes("ebay") ||
      lowerUserMsgEarly.includes("fnac") ||
      lowerUserMsgEarly.includes("cdiscount") ||
      lowerUserMsgEarly.includes("deal") ||
      lowerUserMsgEarly.includes("promo") ||
      lowerUserMsgEarly.includes("compar") ||
      lowerUserMsgEarly.includes("boutique") ||
      lowerUserMsgEarly.includes("revendeur") ||
      lowerUserMsgEarly.includes("retailer") ||
      lowerUserMsgEarly.includes("stock") ||
      lowerUserMsgEarly.includes("dispo") ||
      lowerUserMsgEarly.includes("panier") ||
      lowerUserMsgEarly.includes("cart");
    const hasRetailerToolAvailableEarly = availableTools.some(
      (t) =>
        t.function.name === "searchRetailers" ||
        t.function.name === "searchSingleRetailer" ||
        t.function.name === "trackRetailerProduct" ||
        t.function.name === "compareProductPrices" ||
        t.function.name === "getRetailerDeals" ||
        t.function.name === "listAvailableRetailers",
    );
    const localModelIsSmallEarly =
      LOCAL_LLM_MODEL_NAME.includes(":3b") || LOCAL_LLM_MODEL_NAME.includes(":7b");
    const skipLocalForRetailer =
      needsRetailerToolsEarly && hasRetailerToolAvailableEarly && localModelIsSmallEarly;
    if (skipLocalForRetailer) {
      const bigModels = modelsToTry.filter((m) => !SMALL_MODEL_PATTERNS.some((p) => p.test(m)));
      if (bigModels.length > 0) {
        effectiveModels = bigModels;
        maxModelAttempts = Math.min(bigModels.length, 4);
        logger.info(
          `[AgentLoop] 🏪 Retailer filter: ${bigModels.length} big models kept, ${modelsToTry.length - bigModels.length} small models skipped`,
        );
      } else {
        logger.warn(
          `[AgentLoop] 🏪 Retailer filter: no big models available, using all ${modelsToTry.length} models`,
        );
      }
    }

    logger.info(
      `[AgentLoop] 🧠 Task complexity: ${taskComplexity} | Models to try: ${effectiveModels.slice(0, maxModelAttempts).join(", ")}${effectiveModels.length > maxModelAttempts ? ` (+${effectiveModels.length - maxModelAttempts} more)` : ""}`,
    );

    // ─── Circuit breaker safety net: if all models are in cooldown, reset them ───
    ensureAtLeastOneModelAvailable();

    // ─── Étape 0: LLM local (Ollama/qwen2.5) — chat simple uniquement ───
    // Qwen 3B/7B: gère le chat simple en local (rapide, gratuit).
    // Toute tâche avec tools → API cloud 70B (NVIDIA NIM / Groq) pour qualité.
    // skipLocalForRetailer already computed above

    const canUseLocalForImages = imageUrls.length === 0 || isLocalLlmVisionAvailable();

    // ─── Mode hybride: petits modèles (3B/7B) = chat simple uniquement ───
    // Qwen 3B/7B gère le chat simple (salut, questions générales) en local.
    // Toute tâche avec tools → skip direct vers API cloud (70B) pour qualité.
    const isSmallLocalModel =
      LOCAL_LLM_MODEL_NAME.includes(":3b") || LOCAL_LLM_MODEL_NAME.includes(":7b");
    const skipLocalForAnyTools = isSmallLocalModel && availableTools.length > 0;

    if (
      isLocalLlmAvailable() &&
      !skipLocalForRetailer &&
      !skipLocalForAnyTools &&
      canUseLocalForImages
    ) {
      logger.info(
        `[AgentLoop] 🏠 Tentative LLM local: ${LOCAL_LLM_MODEL_NAME} (chat simple, sans tools)`,
      );

      try {
        // Chat simple sans tools — le local est parfait pour ça
        const localText = await chatWithLocalLlm(
          buildProviderConversation(conversation, imageUrls),
          {
            maxTokens: getPersonalityMaxTokens(),
            temperature: getPersonalityTemperature(),
            timeoutMs: 12_000,
            model: imageUrls.length > 0 ? getLocalLlmVisionModelName() || undefined : undefined,
          },
        );
        if (localText && localText.length > 2) {
          response = {
            choices: [
              {
                message: { role: "assistant", content: localText },
                finish_reason: "stop",
              },
            ],
          } as never;
          logger.info(
            `[AgentLoop] ✅ ${LOCAL_LLM_MODEL_NAME} réussi (chat simple, ${localText.length} chars) — API économisée`,
          );
          recordLocalLlm();
          break;
        }
        logger.warn(`[AgentLoop] ⚠️ ${LOCAL_LLM_MODEL_NAME} échec chat simple — fallback API`);
      } catch (localErr) {
        const isTimeout = localErr instanceof Error && localErr.message.includes("timeout");
        logger.warn(
          `[AgentLoop] ❌ LLM local ${isTimeout ? "timeout" : "échec"} — fallback API immédiat: ${localErr instanceof Error ? localErr.message : String(localErr)}`,
        );
      }
    } else if (skipLocalForAnyTools) {
      logger.info(
        `[AgentLoop] 🏠⏭️ LLM local skippé (${availableTools.length} tools nécessaires) — API cloud 70B pour tools`,
      );
    } else if (imageUrls.length > 0 && !canUseLocalForImages) {
      logger.info(`[AgentLoop] 👁️ Vision locale indisponible — passage au provider vision/API`);
    } else if (skipLocalForRetailer) {
      logger.info(
        `[AgentLoop] 🏠⏭️ LLM local skippé (retailer tools nécessaires) — utilisation API directement`,
      );
    } else {
      logger.info(`[AgentLoop] 🏠 LLM local non disponible — utilisation API directement`);
    }

    // ─── Étape 1: Appel unifié via aiGateway ───
    // aiGateway gère: provider ordering, retry, fallback, budget, metrics, timeout.
    // On lui passe le modèle préféré et les tools. Si le provider principal échoue,
    // aiGateway fallback automatiquement vers Groq, Cerebras, SambaNova, Gemini, etc.
    if (!response) {
      const preferredModelName = effectiveModels[0] ?? preferredModel;
      try {
        logger.info(`[AgentLoop] 🎯 Appel aiGateway (modèle préféré: ${preferredModelName})`);
        const llmResult = await callLlm({
          messages: buildProviderConversation(conversation, imageUrls).map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          })),
          model: preferredModelName,
          tools:
            availableTools.length > 0
              ? compactTools(availableTools).map((t) => ({
                  type: "function" as const,
                  function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters as object,
                  },
                }))
              : undefined,
          requireToolCalling: availableTools.length > 0,
          requireVision: imageUrls.length > 0,
          maxTokens: getPersonalityMaxTokens(),
          temperature: getPersonalityTemperature(),
          timeoutMs: 30_000,
          maxRetries: 1,
          deadlineMs: Math.max(
            5_000,
            (isComplexTask(userMessage) ? AGENT_LOOP_TIMEOUT_LONG_MS : AGENT_LOOP_TIMEOUT_MS) -
              (Date.now() - loopStartTime),
          ),
          userId: message.author.id,
          guildId: message.guildId || undefined,
          commandName: "agentLoop",
        });

        response = {
          choices: [
            {
              message: {
                content: llmResult.content,
                tool_calls: llmResult.toolCalls as any[] | undefined,
              },
              finish_reason: llmResult.finishReason,
            },
          ],
        };

        markModelSuccess(llmResult.model);
        recordModelLatency(llmResult.model, llmResult.latencyMs);
        agentModelUsed.labels(llmResult.model, "success").inc();
        recordApiLlm();
        logger.info(
          `[AgentLoop] ✅ ${llmResult.provider}/${llmResult.model} réussi (${llmResult.latencyMs}ms, fallback: ${llmResult.fallbackCount})`,
        );
      } catch (llmErr) {
        const msg = llmErr instanceof Error ? llmErr.message : String(llmErr);
        lastErrMsg = msg;
        agentModelUsed.labels(preferredModelName, "fail").inc();
        logger.warn(`[AgentLoop] ❌ aiGateway call failed: ${msg.slice(0, 120)}`);
      }
    }

    // ─── Étape 2: Tous les fallbacks ont échoué — retry ───
    if (!response) {
      // Retry automatique après un court délai si c'est un rate-limit ou timeout
      const isRetryable =
        lastErrMsg.includes("429") ||
        lastErrMsg.includes("rate") ||
        lastErrMsg.includes("timeout") ||
        lastErrMsg.includes("503") ||
        lastErrMsg.includes("overloaded");

      if (isRetryable && iteration < maxIterations - 1) {
        logger.warn(`[AgentLoop] ⏳ Retry automatique dans 1.5s (tous les providers ont échoué)`);
        await new Promise((r) => setTimeout(r, 1500));
        ensureAtLeastOneModelAvailable();
        continue; // Continue l'agent loop au lieu de retourner une erreur
      }

      completeInteraction(breakerState);
      // Ne jamais exposer de message d'erreur technique à l'utilisateur.
      // Retourner "" déclenche la chaîne de fallback de messages.ts.
      logger.warn(
        `[AgentLoop] Tous providers échoués (${lastErrMsg.slice(0, 120)}) — fallback aval`,
      );
      return "";
    }

    const choice = (
      response as {
        choices: Array<{ message: { content: string | null; tool_calls?: any[] } }>;
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
        logger.error("[Silent catch]");
      }
    }

    // Si l'IA n'a pas demandé d'outil → c'est la réponse finale
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      const finalReply = assistantMessage.content || "";
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

      // ─── MODULE C: Reset retry state ───
      resetRetries(breakerState.interactionId);

      // ─── Cognitive Loop Engine: purge on success ───
      purgeCognitiveSession(cognitiveSessionId);

      // ─── Filter hallucinated error responses ──
      if (isErrorResponse(finalReply)) {
        logger.warn(`[AgentLoop] ⚠️ LLM returned a hallucinated error response — filtering`);
        return "";
      }

      // ─── MODULE B2: Mettre en cache sémantique (only valid responses) ───
      cacheResponse(userMessage, finalReply, cacheCtx);

      return finalReply;
    }

    // L'IA a demandé un ou plusieurs outils → on les exécute en parallèle
    conversation.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: assistantMessage.tool_calls,
    });

    // Exécuter tous les tools en parallèle pour la performance
    const rawToolCalls = (assistantMessage.tool_calls ?? []) as Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;

    // Filter out malformed tool calls (missing function or name)
    const toolCalls = rawToolCalls.filter(
      (tc) => tc && tc.function && typeof tc.function.name === "string",
    );
    if (rawToolCalls.length > toolCalls.length) {
      logger.warn(
        `[AgentLoop] ${rawToolCalls.length - toolCalls.length} tool call(s) malformé(s) ignoré(s)`,
      );
    }

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
        let args: Record<string, any> = {};

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
              const cached = await getCachedToolResult(toolName, args);
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
                logger.info(
                  `[AgentLoop] 🎼 Délégation orchestrateur: tier=${args.tier}, tâche=${String(args.task).slice(0, 60)}...`,
                );
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
                    void setCachedToolResult(toolName, args, result.data);
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
                // Deny-by-default: a tool without an immutable risk classification
                // must never be executable through prompt-generated tool calls.
                logger.warn(`[AgentLoop] 🛑 Unclassified tool blocked: ${toolName}`);
                result = {
                  success: false,
                  data: `Outil ${toolName} bloqué : aucune classification de risque fiable n'est enregistrée.`,
                };
                recordToolFailure(toolName);
                agentToolCalls.labels(toolName, "fail").inc();
                agentToolCallsDaily.labels(toolName).inc();
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
          let retryResult: ToolExecutionResult & { data: string };
          const retryRisk = getRiskLevel(toolName);
          if (retryRisk === "low") {
            retryResult = (await executeTool(toolName, retryArgs, ctx)) as ToolExecutionResult & {
              data: string;
            };
          } else if (isRestrictedTool(toolName)) {
            const approved = await requestToolApproval(toolName, retryArgs, message.author.id);
            retryResult = approved
              ? ((await executeTool(toolName, retryArgs, ctx)) as ToolExecutionResult & {
                  data: string;
                })
              : ({
                  success: false,
                  data: `Retry de ${toolName} bloqué par la validation SOAR.`,
                } as ToolExecutionResult & { data: string });
          } else {
            retryResult = {
              success: false,
              data: `Retry de ${toolName} bloqué : tool non classifié.`,
            } as ToolExecutionResult & { data: string };
          }
          logger.info(
            `[AgentLoop] 🔧 ${toolName} retry → ${retryResult.success ? "OK" : "FAIL"}: ${String(retryResult.data).slice(0, 100)}`,
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
  username?: string,
): Promise<void> {
  try {
    const llmResult = await callLlm({
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
      maxTokens: 200,
      temperature: 0.3,
      timeoutMs: 10_000,
      maxRetries: 0,
    });

    const raw = llmResult.content || "{}";
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
      // Aussi écrire dans Obsidian (fire-and-forget)
      void appendUserFact(
        userId,
        username || "unknown",
        fact.key,
        fact.value,
        fact.category || "auto",
      ).catch(() => {});
    }

    logger.info(`[AgentLoop] 💾 ${parsed.facts.length} faits sauvegardés pour ${userId}`);
  } catch (error) {
    // Non-critique — la mémoire est optionnelle
    logger.debug(
      `[AgentLoop] Extraction mémoire échouée: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
