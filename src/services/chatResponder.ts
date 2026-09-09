/**
 * chatResponder.ts — Répondeur chatbot garanti
 *
 * Point d'entrée unique pour le chat IA. Garantit:
 *  - TOUJOURS une réponse (jamais de message "modèles indisponibles")
 *  - Rapidité: providers ordonnés par latence mesurée, timeouts courts
 *  - Sanitization: les hallucinations de messages d'erreur sont filtrées et
 *    déclenchent un fallback vers le provider suivant
 *  - Repli gracieux: si tout échoue, réponse conversationnelle honnête
 *    au lieu d'un message d'erreur technique
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";
import {
  buildPersonalitySystemPrompt,
  DEFAULT_OPERATING_PROMPT,
} from "../infrastructure/middleware/personalityMiddleware.js";
import { callLlm, getProviderStatus, type LlmCallRequest, type ProviderName } from "./aiGateway.js";
import {
  isHallucinatedError,
  isErrorResponse,
  sanitizeResponse as classifySanitize,
  FALLBACK_MESSAGE,
} from "./responseClassifier.js";
import { hallucinationDetected } from "./prometheusExporter.js";
import { isPresencePing } from "./agentIntent.js";
import { resetAllCircuitBreakers, ensureAtLeastOneModelAvailable } from "./modelRotation.js";

// ─── Sanitization des réponses (délégué au classifieur unique) ───────────────

/**
 * Détecte si une réponse IA contient une hallucination de message d'erreur.
 * Délègue à responseClassifier.ts — source unique de vérité.
 */
export function containsHallucinatedError(text: string): boolean {
  return isHallucinatedError(text);
}

/**
 * Nettoie une réponse: supprime les lignes d'erreur/hallucination.
 * Délègue à responseClassifier.ts.
 */
export function sanitizeResponse(text: string): string {
  return classifySanitize(text);
}

// ─── Sélection de l'ordre des providers par vitesse ──────────────────────────

const BASE_ORDER: ProviderName[] = [
  "groq", // ~300-800ms, le plus rapide
  "cerebras", // ~400-900ms
  "sambanova", // ~500-1200ms
  "nvidia-nim", // ~1-2s
  "gemini", // ~1.5-3s
  "openrouter", // ~2-5s
  "local-llm", // variable, souvent lent
  "huggingface",
  "colab",
];

/**
 * Ordonne les providers par vitesse mesurée (avgLatencyMs).
 * Les providers en échec récent sont relégués à la fin.
 * Les providers jamais utilisés gardent leur ordre de base.
 */
export function orderProvidersBySpeed(preferred?: ProviderName[]): ProviderName[] {
  const base = preferred ?? BASE_ORDER;
  return [...base].sort((a, b) => {
    const sa = getProviderStatus(a);
    const sb = getProviderStatus(b);
    const aUnhealthy = sa && sa.totalCalls > 2 && sa.totalFailures / sa.totalCalls > 0.5;
    const bUnhealthy = sb && sb.totalCalls > 2 && sb.totalFailures / sb.totalCalls > 0.5;
    if (aUnhealthy && !bUnhealthy) return 1;
    if (!aUnhealthy && bUnhealthy) return -1;
    const la = sa?.avgLatencyMs || 0;
    const lb = sb?.avgLatencyMs || 0;
    if (la === 0 && lb === 0) return base.indexOf(a) - base.indexOf(b);
    if (la === 0) return 1;
    if (lb === 0) return -1;
    return la - lb;
  });
}

// ─── Last unanswered question (retry with « go » without retyping) ───────────

const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingQuestions = new Map<string, { question: string; at: number }>();
const RETRY_CUE =
  /^(go|retry|reessaye|réessaie|réessaye|encore|relance|stp|s['']il te pla[iî]t|ok|oui|yes|\?+|…|\.{2,})!*$/i;

function stripPromptDecorations(text: string): string {
  return text.replace(/\[LANGUAGE INSTRUCTION\][\s\S]*?\n\n/i, "").trim();
}

export function noteUnansweredQuestion(userId: string, question: string): void {
  if (!userId) return;
  const stripped = stripPromptDecorations(question);
  if (stripped.length < 2 || isRetryCue(stripped)) return;
  pendingQuestions.set(userId, { question: stripped, at: Date.now() });
}

export function clearPendingQuestion(userId: string): void {
  if (userId) pendingQuestions.delete(userId);
}

function isRetryCue(text: string): boolean {
  const t = text.trim();
  return !t || RETRY_CUE.test(t);
}

export function takePendingQuestion(userId: string, incoming: string): string | null {
  if (!userId) return null;
  const pending = pendingQuestions.get(userId);
  if (!pending || Date.now() - pending.at > PENDING_TTL_MS) {
    pendingQuestions.delete(userId);
    return null;
  }
  if (isRetryCue(incoming)) {
    pendingQuestions.delete(userId);
    return pending.question;
  }
  // New question: drop the stale pending so a later « go » cannot resurrect it.
  pendingQuestions.delete(userId);
  return null;
}

/**
 * Empty ping / « go » / « retry » replays the last unanswered question.
 * A real new question forgets the old pending. Attachments are left as-is.
 */
export function resolveIncomingQuestion(
  userId: string,
  incoming: string,
  hasAttachments = false,
): string {
  const t = incoming.trim();
  if (hasAttachments) {
    if (t && !isRetryCue(t)) clearPendingQuestion(userId);
    return t;
  }
  return takePendingQuestion(userId, t) ?? t;
}

export function __resetPendingQuestionsForTests(): void {
  pendingQuestions.clear();
}

// ─── API principale ──────────────────────────────────────────────────────────

export interface ChatRespondOptions {
  systemPrompt?: string;
  userId?: string;
  guildId?: string;
  maxTokens?: number;
  temperature?: number;
  /** Deadline globale en ms — on abandonne les providers lents au-delà */
  deadlineMs?: number;
  /** Délai avant le retry silencieux de recoverChatReply (0 en tests) */
  retryDelayMs?: number;
}

export interface ChatRespondResult {
  content: string;
  provider: ProviderName | "fallback";
  latencyMs: number;
  fromFallback: boolean;
}

/**
 * Répond à un message de chat avec garantie de réponse.
 *
 * - Essaie les providers dans l'ordre de vitesse
 * - Rejette les réponses hallucinées (messages d'erreur inventés) et
 *   bascule sur le provider suivant
 * - Sanitize la réponse finale
 * - Si tout échoue: retourne une réponse conversationnelle de repli
 *   (jamais de message technique "indisponible")
 */
export async function respondChat(
  userMessage: string,
  history: Array<{ role: "system" | "user" | "assistant"; content: string }> = [],
  options: ChatRespondOptions = {},
): Promise<ChatRespondResult> {
  const startedAt = Date.now();
  const systemPrompt =
    options.systemPrompt ??
    buildPersonalitySystemPrompt(config.aiSystemPrompt || DEFAULT_OPERATING_PROMPT);

  const request: LlmCallRequest = {
    messages: [
      { role: "system", content: systemPrompt },
      ...history.slice(-8),
      { role: "user", content: userMessage },
    ],
    maxTokens: options.maxTokens ?? 800,
    temperature: options.temperature ?? 0.7,
    timeoutMs: Math.min(options.deadlineMs ?? 15_000, 20_000),
    maxRetries: 1,
    userId: options.userId,
    guildId: options.guildId,
    providerOrder: orderProvidersBySpeed(),
  };

  try {
    const result = await callLlm(request);

    // Rejeter les hallucinations de messages d'erreur → réessayer avec
    // l'ordre des providers modifié (le provider fautif est déjà pénalisé)
    if (containsHallucinatedError(result.content)) {
      hallucinationDetected.labels("error_message").inc();
      logger.warn(
        `[ChatResponder] Hallucination détectée chez ${result.provider} — nouvelle tentative`,
      );
      const retryRequest: LlmCallRequest = {
        ...request,
        providerOrder: orderProvidersBySpeed().filter((p) => p !== result.provider),
      };
      try {
        const retry = await callLlm(retryRequest);
        if (!containsHallucinatedError(retry.content)) {
          return {
            content: retry.content,
            provider: retry.provider,
            latencyMs: Date.now() - startedAt,
            fromFallback: true,
          };
        }
      } catch {
        // continue vers le fallback final
      }
      return {
        content: "",
        provider: "fallback",
        latencyMs: Date.now() - startedAt,
        fromFallback: true,
      };
    }

    const sanitized = sanitizeResponse(result.content);
    return {
      content: sanitized.length > 10 ? sanitized : result.content,
      provider: result.provider,
      latencyMs: Date.now() - startedAt,
      fromFallback: result.fallbackCount > 0,
    };
  } catch (err) {
    logger.warn(
      `[ChatResponder] Tous les providers ont échoué: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      content: "",
      provider: "fallback",
      latencyMs: Date.now() - startedAt,
      fromFallback: true,
    };
  }
}

function isUsableModelReply(text: string): boolean {
  return text.trim().length > 10 && !isErrorResponse(text);
}

async function tryForcedProviders(
  userMessage: string,
  options: ChatRespondOptions,
  providerOrder: ProviderName[],
): Promise<string | null> {
  const systemPrompt =
    options.systemPrompt ??
    buildPersonalitySystemPrompt(config.aiSystemPrompt || DEFAULT_OPERATING_PROMPT);
  try {
    const result = await callLlm({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage.slice(0, 4000) },
      ],
      maxTokens: options.maxTokens ?? 600,
      temperature: options.temperature ?? 0.7,
      timeoutMs: 25_000,
      deadlineMs: 30_000,
      maxRetries: 0,
      userId: options.userId,
      guildId: options.guildId,
      providerOrder,
    });
    const text = classifySanitize(result.content || "").trim();
    return isUsableModelReply(text) ? text : null;
  } catch (err) {
    logger.warn(
      `[ChatResponder] Forced providers (${providerOrder.join(",")}) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * After an empty / error agent-loop result: keep sanitized content if usable,
 * otherwise retry the full provider chain, then force local LLM with its own
 * timeout budget. Never asks the user to retype: we retry in the background
 * (scheduleSilentRecover) and « go » still works as an optional shortcut.
 */
export async function recoverChatReply(
  current: string,
  userMessage: string,
  options: ChatRespondOptions = {},
): Promise<string> {
  const cleaned = classifySanitize(current || "").trim();
  if (isUsableModelReply(cleaned)) {
    if (options.userId) clearPendingQuestion(options.userId);
    return cleaned;
  }

  if (isPresencePing(stripPromptDecorations(userMessage))) {
    if (options.userId) clearPendingQuestion(options.userId);
    return "Ouais, je suis là. Pose ta question.";
  }

  const tryProviders = async (): Promise<string | null> => {
    const result = await respondChat(userMessage.slice(0, 4000), [], {
      ...options,
      maxTokens: options.maxTokens ?? 800,
      deadlineMs: options.deadlineMs ?? 20_000,
    });
    if (result.provider === "fallback") return null;
    const text = classifySanitize(result.content || "").trim();
    return isUsableModelReply(text) ? text : null;
  };

  try {
    const first = await tryProviders();
    if (first) {
      if (options.userId) clearPendingQuestion(options.userId);
      return first;
    }

    // Skip a second identical cascade: it eats the budget before Ollama can run.
    logger.warn("[ChatResponder] Recovery: cascade failed — forcing local-llm then groq/gemini");
    resetAllCircuitBreakers();
    ensureAtLeastOneModelAvailable();
    const delay = options.retryDelayMs ?? (process.env.NODE_ENV === "test" ? 0 : 800);
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const local = await tryForcedProviders(userMessage, options, [
      "local-llm",
      "groq",
      "gemini",
      "openrouter",
    ]);
    if (local) {
      if (options.userId) clearPendingQuestion(options.userId);
      return local;
    }
  } catch (err) {
    logger.warn(
      `[ChatResponder] recoverChatReply failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (options.userId) noteUnansweredQuestion(options.userId, userMessage);
  return FALLBACK_MESSAGE;
}

export default {
  respondChat,
  recoverChatReply,
  orderProvidersBySpeed,
  containsHallucinatedError,
  sanitizeResponse,
  takePendingQuestion,
  noteUnansweredQuestion,
  clearPendingQuestion,
  resolveIncomingQuestion,
};
