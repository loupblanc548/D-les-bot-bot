import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import {
  buildSpamPhishingPrompt,
  buildDeepSentimentPrompt,
  buildLinkSafetyPrompt,
  buildThreatDetectionPrompt,
  buildCodeReviewPrompt,
  buildThreatIntelPrompt,
  parseJsonResponse,
  type ModerationVerdict,
  type DeepSentimentResult,
  type ThreatAssessment,
  type UserProfile,
  type ThreatIntelResult,
} from "./moderationPrompts.js";

export interface ToxicityResult {
  isToxic: boolean;
  category: "normal" | "insult" | "hate_speech" | "harassment" | "spam" | "inappropriate";
  confidence: number;
  explanation: string;
}

const TOXICITY_CACHE = new Map<string, { result: ToxicityResult; timestamp: number }>();
const CACHE_TTL = 60_000;
const MAX_TOXICITY_ENTRIES = 150;

export function clearToxicityCache(): void {
  TOXICITY_CACHE.clear();
}

export async function analyzeToxicity(content: string): Promise<ToxicityResult> {
  const cacheKey = content.slice(0, 200);
  const cached = TOXICITY_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiModerationTimeoutMs);

  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un modérateur de contenu. Analyse le message et réponds UNIQUEMENT avec un objet JSON " +
              'au format : {"isToxic": true/false, "category": "normal|insult|hate_speech|harassment|spam|inappropriate", ' +
              '"confidence": 0.0-1.0, "explanation": "courte explication en français"}. ' +
              "Ne mets pas le JSON dans un bloc de code. Sois strict mais pas excessif : " +
              "les jurons légers sans attaque personnelle ne sont pas toxiques.",
          },
          { role: "user", content },
        ],
        max_tokens: 200,
        temperature: 0.1,
      },
      { signal: controller.signal }
    );

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(raw);
    const result: ToxicityResult = {
      isToxic: parsed.isToxic || false,
      category: parsed.category || "normal",
      confidence: parsed.confidence || 0,
      explanation: parsed.explanation || "",
    };

    TOXICITY_CACHE.set(cacheKey, { result, timestamp: Date.now() });
    if (TOXICITY_CACHE.size > MAX_TOXICITY_ENTRIES) {
      const now = Date.now();
      for (const [k, v] of TOXICITY_CACHE) {
        if (now - v.timestamp > CACHE_TTL) TOXICITY_CACHE.delete(k);
      }
      if (TOXICITY_CACHE.size > MAX_TOXICITY_ENTRIES) {
        const firstKey = TOXICITY_CACHE.keys().next().value;
        if (firstKey) TOXICITY_CACHE.delete(firstKey);
      }
    }

    return result;
  } catch (error) {
    logger.error("[AI-Moderation] Erreur:", String(error));
    if ((error as Error).name === "AbortError") {
      return { isToxic: false, category: "normal", confidence: 0, explanation: "Timeout" };
    }
    return { isToxic: false, category: "normal", confidence: 0, explanation: "Erreur API" };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Spam/Phishing Detection (structured prompt) ──────────────────────

export async function detectSpamPhishing(message: string): Promise<ModerationVerdict> {
  try {
    const client = getOpenAIClient();
    const prompt = buildSpamPhishingPrompt(message);
    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        { role: "system", content: "Tu es un modérateur Discord expert. Réponds UNIQUEMENT en JSON valide." },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.1,
    }, { timeout: 15_000 });

    const raw = completion.choices[0]?.message?.content || "";
    const parsed = parseJsonResponse<ModerationVerdict>(raw);
    if (!parsed) {
      return { verdict: "clean", confidence: 0, raison: "Parse error", action: "none" };
    }
    return parsed;
  } catch (error) {
    logger.error("[AI-Moderation] detectSpamPhishing:", String(error));
    return { verdict: "clean", confidence: 0, raison: "Erreur API", action: "none" };
  }
}

// ─── Deep Sentiment Analysis (5 dimensions) ───────────────────────────

export async function deepSentimentAnalysis(message: string, context?: string): Promise<DeepSentimentResult> {
  try {
    const client = getOpenAIClient();
    const prompt = buildDeepSentimentPrompt(message, context);
    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        { role: "system", content: "Tu es un expert en psychologie et analyse de sentiment. Réponds UNIQUEMENT en JSON valide." },
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.2,
    }, { timeout: 20_000 });

    const raw = completion.choices[0]?.message?.content || "";
    const parsed = parseJsonResponse<DeepSentimentResult>(raw);
    if (!parsed) {
      return {
        sentiment: "neutre",
        dimensions: { positivité: 0, agressivité: 0, spam: 0, phishing: 0, harcèlement: 0 },
        risque_global: 0, flags: [], action_recommandée: "rien", explication: "Parse error",
      };
    }
    return parsed;
  } catch (error) {
    logger.error("[AI-Moderation] deepSentimentAnalysis:", String(error));
    return {
      sentiment: "neutre",
      dimensions: { positivité: 0, agressivité: 0, spam: 0, phishing: 0, harcèlement: 0 },
      risque_global: 0, flags: [], action_recommandée: "rien", explication: "Erreur API",
    };
  }
}

// ─── Link Safety Check ────────────────────────────────────────────────

export async function checkLinkSafety(url: string): Promise<{
  sûr: boolean; confiance: number; type_menace: string; raison: string; action: string;
}> {
  try {
    const client = getOpenAIClient();
    const prompt = buildLinkSafetyPrompt(url);
    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        { role: "system", content: "Tu es un expert en cybersécurité. Réponds UNIQUEMENT en JSON valide." },
        { role: "user", content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.1,
    }, { timeout: 10_000 });

    const raw = completion.choices[0]?.message?.content || "";
    const parsed = parseJsonResponse<{ sûr: boolean; confiance: number; type_menace: string; raison: string; action: string }>(raw);
    if (!parsed) {
      return { sûr: true, confiance: 0, type_menace: "aucun", raison: "Parse error", action: "autoriser" };
    }
    return parsed;
  } catch (error) {
    logger.error("[AI-Moderation] checkLinkSafety:", String(error));
    return { sûr: true, confiance: 0, type_menace: "aucun", raison: "Erreur API", action: "autoriser" };
  }
}

// ─── Threat Detection (7 factors) ─────────────────────────────────────

export async function assessThreat(profile: UserProfile): Promise<ThreatAssessment> {
  try {
    const client = getOpenAIClient();
    const prompt = buildThreatDetectionPrompt(profile);
    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        { role: "system", content: "Tu es un expert en détection de menaces cyber. Réponds UNIQUEMENT en JSON valide." },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.15,
    }, { timeout: 15_000 });

    const raw = completion.choices[0]?.message?.content || "";
    const parsed = parseJsonResponse<ThreatAssessment>(raw);
    if (!parsed) {
      return {
        risk_score: 0,
        risk_level: "très_bas",
        factors: { new_account: 0, message_rate: 0, raid_pattern: 0, phishing: 0, spam: 0, harassment: 0, malware: 0 },
        action: "monitor",
        confidence: 0,
        reasoning: "Parse error",
      };
    }
    return parsed;
  } catch (error) {
    logger.error("[AI-Moderation] assessThreat:", String(error));
    return {
      risk_score: 0,
      risk_level: "très_bas",
      factors: { new_account: 0, message_rate: 0, raid_pattern: 0, phishing: 0, spam: 0, harassment: 0, malware: 0 },
      action: "monitor",
      confidence: 0,
      reasoning: "Erreur API",
    };
  }
}

// ─── Code Review IA ───────────────────────────────────────────────────

export async function reviewCode(
  code: string,
  context?: { framework?: string; version?: string; environment?: string },
): Promise<string> {
  try {
    const client = getOpenAIClient();
    const prompt = buildCodeReviewPrompt(code, context);
    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        { role: "system", content: "Tu es un expert en code review. Réponds en Markdown structuré." },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.2,
    }, { timeout: 30_000 });

    return completion.choices[0]?.message?.content || "❌ Analyse impossible.";
  } catch (error) {
    logger.error("[AI-Moderation] reviewCode:", String(error));
    return "❌ Erreur lors de l'analyse de code.";
  }
}

// ─── Threat Intelligence (IP/Domain) ──────────────────────────────────

export async function analyzeThreatIntel(ipOrDomain: string): Promise<ThreatIntelResult> {
  try {
    const client = getOpenAIClient();
    const prompt = buildThreatIntelPrompt(ipOrDomain);
    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        { role: "system", content: "Tu es un expert en threat intelligence. Réponds UNIQUEMENT en JSON valide." },
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.15,
    }, { timeout: 20_000 });

    const raw = completion.choices[0]?.message?.content || "";
    const parsed = parseJsonResponse<ThreatIntelResult>(raw);
    if (!parsed) {
      return {
        target: ipOrDomain,
        threat_level: "none",
        findings: {
          reputation: "données limitées",
          location: "inconnue",
          associated_ips: [],
          malware_detections: [],
          phishing_reports: [],
        },
        actions_recommended: ["monitor"],
        confidence: 0,
      };
    }
    return parsed;
  } catch (error) {
    logger.error("[AI-Moderation] analyzeThreatIntel:", String(error));
    return {
      target: ipOrDomain,
      threat_level: "none",
      findings: {
        reputation: "Erreur API",
        location: "inconnue",
        associated_ips: [],
        malware_detections: [],
        phishing_reports: [],
      },
      actions_recommended: ["monitor"],
      confidence: 0,
    };
  }
}
