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
import { callLlm, getProviderStatus, type LlmCallRequest, type ProviderName } from "./aiGateway.js";
import {
  classifyResponse,
  isHallucinatedError,
  sanitizeResponse as classifySanitize,
} from "./responseClassifier.js";
import { hallucinationDetected } from "./prometheusExporter.js";

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

// ─── Réponses de repli conversationnelles ────────────────────────────────────

const FALLBACK_REPLIES = [
  "Hmm, laisse-moi reformuler ça dans ma tête une seconde… Peux-tu me redonner ta question ?",
  "Je suis en pleine réflexion là. Repose ta question, je te réponds tout de suite.",
  "Petit blanc de mon côté — redis-moi ce que tu voulais savoir ?",
];

function pickFallbackReply(): string {
  return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
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
    config.aiSystemPrompt ??
    "Tu es un assistant IA utile et amical sur Discord. Réponds en français de manière concise et naturelle.";

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
        content: pickFallbackReply(),
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
      content: pickFallbackReply(),
      provider: "fallback",
      latencyMs: Date.now() - startedAt,
      fromFallback: true,
    };
  }
}

export default { respondChat, orderProvidersBySpeed, containsHallucinatedError, sanitizeResponse };
