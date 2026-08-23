/**
 * moderationCascade.ts — Cascade de modération en 3 niveaux
 *
 * Niveau 1: Règles déterministes (mots interdits, regex, seuils)
 * Niveau 2: Modèle local léger (Ollama) pour cas ambigus
 * Niveau 3: Modèle cloud (Gemini) uniquement pour les cas complexes
 *
 * Objectif: réduire les appels cloud de ~90% en traitant localement
 */

import logger from "../utils/logger.js";
import { isLocalLlmAvailable } from "./localLlm.js";
import { isGeminiAvailable, chatWithGemini } from "./gemini.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ModerationLevel = "deterministic" | "local-llm" | "cloud";

export interface ModerationResult {
  action: "allow" | "warn" | "delete" | "timeout" | "ban";
  confidence: number; // 0-1
  level: ModerationLevel;
  reason: string;
  matchedRules: string[];
  latencyMs: number;
}

export interface ModerationInput {
  content: string;
  userId: string;
  guildId: string;
  channelType: "text" | "dm" | "thread" | "voice";
  isBot: boolean;
  hasAttachments: boolean;
  accountAgeDays: number;
}

// ─── Niveau 1: Règles déterministes ──────────────────────────────────────────

const BANNED_WORDS = [
  "discord.gg/",
  "discord.com/invite/",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "kill yourself",
  "kys",
];

const SPAM_PATTERNS = [
  /(\S+)\1{10,}/i, // Repeated chars (aaaaaaaaaaa)
  /(.)\1{15,}/i, // Repeated single char
  /https?:\/\/\S+\s+https?:\/\/\S+\s+https?:\/\/\S+/, // 3+ links
];

const SUSPICIOUS_PATTERNS = [
  /@everyone/i,
  /@here/i,
  /free\s*nitro/i,
  /steam\s*gift/i,
  /click\s*here\s*to\s*claim/i,
];

function deterministicCheck(input: ModerationInput): ModerationResult | null {
  const content = input.content.toLowerCase();
  const matched: string[] = [];

  // Banned words → immediate delete
  for (const word of BANNED_WORDS) {
    if (content.includes(word)) {
      matched.push(`banned_word:${word}`);
    }
  }
  if (matched.length > 0) {
    return {
      action: "delete",
      confidence: 0.95,
      level: "deterministic",
      reason: `Banned content detected: ${matched.join(", ")}`,
      matchedRules: matched,
      latencyMs: 0,
    };
  }

  // Spam patterns → delete
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(content)) {
      matched.push(`spam_pattern:${pattern.source.slice(0, 30)}`);
    }
  }
  if (matched.length > 0) {
    return {
      action: "delete",
      confidence: 0.85,
      level: "deterministic",
      reason: `Spam pattern detected`,
      matchedRules: matched,
      latencyMs: 0,
    };
  }

  // Suspicious patterns → warn (escalate to L2)
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(content)) {
      matched.push(`suspicious:${pattern.source.slice(0, 30)}`);
    }
  }
  if (matched.length > 0) {
    // Return null to escalate — deterministic can't decide
    return null;
  }

  // New account + long message → escalate
  if (input.accountAgeDays < 7 && input.content.length > 500) {
    return null; // Escalate to L2
  }

  // All clear
  return {
    action: "allow",
    confidence: 1.0,
    level: "deterministic",
    reason: "No rules matched",
    matchedRules: [],
    latencyMs: 0,
  };
}

// ─── Niveau 2: Modèle local léger ────────────────────────────────────────────

async function localLlmCheck(input: ModerationInput): Promise<ModerationResult | null> {
  if (!isLocalLlmAvailable()) return null;

  const start = Date.now();
  try {
    // Dynamic import to avoid loading localLlm if not needed
    const { chatWithLocalLlm } = await import("./localLlm.js");
    const prompt = `Analyze this message for moderation. Reply with JSON: {"action":"allow"|"warn"|"delete","confidence":0-1,"reason":"..."}\n\nMessage: "${input.content.slice(0, 500)}"\nUser account age: ${input.accountAgeDays} days\nChannel: ${input.channelType}`;

    const response = await chatWithLocalLlm([{ role: "user", content: prompt }], {
      maxTokens: 200,
    });
    const latency = Date.now() - start;

    if (!response) {
      return {
        action: "allow",
        confidence: 0.5,
        level: "local-llm",
        reason: "Local LLM returned null",
        matchedRules: [],
        latencyMs: latency,
      };
    }

    // Parse response
    const jsonMatch = response.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return {
        action: "allow",
        confidence: 0.5,
        level: "local-llm",
        reason: "Local LLM returned unparseable response",
        matchedRules: [],
        latencyMs: latency,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      action: string;
      confidence: number;
      reason: string;
    };
    return {
      action: parsed.action as ModerationResult["action"],
      confidence: parsed.confidence,
      level: "local-llm",
      reason: parsed.reason,
      matchedRules: [],
      latencyMs: latency,
    };
  } catch (err) {
    logger.warn(`[ModerationCascade] Local LLM check failed: ${err}`);
    return null; // Escalate to L3
  }
}

// ─── Niveau 3: Modèle cloud ──────────────────────────────────────────────────

async function cloudCheck(input: ModerationInput): Promise<ModerationResult> {
  const start = Date.now();
  try {
    const response = await chatWithGemini(
      `You are a moderation AI. Analyze this message and respond with JSON only.\n{"action":"allow"|"warn"|"delete"|"timeout"|"ban","confidence":0-1,"reason":"brief explanation"}\n\nContext: User account is ${input.accountAgeDays} days old, in ${input.channelType} channel.\nMessage: "${input.content.slice(0, 1000)}"`,
      "",
      200,
    );
    const latency = Date.now() - start;

    if (!response) {
      return {
        action: "allow",
        confidence: 0.3,
        level: "cloud",
        reason: "Cloud model returned null, defaulting to allow",
        matchedRules: [],
        latencyMs: latency,
      };
    }

    const jsonMatch = response.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        action: string;
        confidence: number;
        reason: string;
      };
      return {
        action: parsed.action as ModerationResult["action"],
        confidence: parsed.confidence,
        level: "cloud",
        reason: parsed.reason,
        matchedRules: [],
        latencyMs: latency,
      };
    }

    return {
      action: "allow",
      confidence: 0.3,
      level: "cloud",
      reason: "Cloud model returned unparseable response, defaulting to allow",
      matchedRules: [],
      latencyMs: latency,
    };
  } catch (err) {
    return {
      action: "allow",
      confidence: 0.1,
      level: "cloud",
      reason: `Cloud check failed: ${err}`,
      matchedRules: [],
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Cascade principale ──────────────────────────────────────────────────────

export async function moderate(input: ModerationInput): Promise<ModerationResult> {
  const start = Date.now();

  // L1: Deterministic
  const l1Result = deterministicCheck(input);
  if (l1Result) {
    l1Result.latencyMs = Date.now() - start;
    return l1Result;
  }

  // L2: Local LLM
  const l2Result = await localLlmCheck(input);
  if (l2Result && l2Result.confidence >= 0.7) {
    l2Result.latencyMs = Date.now() - start;
    return l2Result;
  }

  // L3: Cloud
  if (isGeminiAvailable()) {
    const l3Result = await cloudCheck(input);
    l3Result.latencyMs = Date.now() - start;
    return l3Result;
  }

  // Fallback: if no cloud available, use L2 result or default allow
  if (l2Result) {
    l2Result.latencyMs = Date.now() - start;
    return l2Result;
  }

  return {
    action: "allow",
    confidence: 0.5,
    level: "deterministic",
    reason: "No moderation layers available, defaulting to allow",
    matchedRules: [],
    latencyMs: Date.now() - start,
  };
}

export default { moderate };
