/**
 * toolPrefetch.ts — Pré-exécution de tools évidents pendant que le LLM réfléchit
 *
 * Détecte les intentions claires (météo, prix crypto, NASA APOD) et pré-exécute
 * le tool correspondant. Le résultat est injecté dans le contexte pour que le LLM
 * n'ait pas besoin de rappeler le tool → économise une itération.
 */

import logger from "../utils/logger.js";

export interface PrefetchResult {
  toolName: string;
  summary: string;
}

interface PrefetchRule {
  toolName: string;
  patterns: RegExp[];
  extractArgs: (message: string) => Record<string, any> | null;
  formatResult: (result: any) => string;
}

function normalizePrefetchText(message: string): string {
  return message
    .replace(/\[LANGUAGE INSTRUCTION\][\s\S]*?\n\n/i, "")
    .replace(/<@!?\d+>/g, " ")
    .trim();
}

function extractTargetUserId(message: string): string | undefined {
  const ids = [...message.matchAll(/<@!?(\d{17,19})>/g)].map((m) => m[1]);
  const johnId = process.env.JOHN_BOT_USER_ID?.trim() || "1512435587926200391";
  return ids.find((id) => id !== johnId);
}

// Les rules seront résolues dynamiquement pour éviter les imports circulaires
const PREFETCH_RULES: PrefetchRule[] = [
  {
    toolName: "getUserInfo",
    patterns: [
      /\bcasier\b/i,
      /\bhistorique\b.*\b(sanction|ban|timeout|kick|mute)/i,
      /\blogs?\b.*\b(sanction|ban|timeout|kick|mute)/i,
      /\b(montre|montrer|pr[ée]sente|afficher?|liste|voir)\b.*\b(sanction|ban|timeout|kick|mute|casier)/i,
    ],
    extractArgs: (msg) => {
      const userId = extractTargetUserId(msg);
      return userId ? { userId } : {};
    },
    formatResult: (result) => {
      const text = typeof result === "string" ? result : JSON.stringify(result);
      return `Casier / logs de sanctions — recopie le tableau markdown tel quel :\n${text.slice(0, 4000)}`;
    },
  },
  {
    toolName: "getWeather",
    patterns: [
      /\b(météo|weather|température|temps)\b.*\b(pour|à|a|in|at|de|of)\b\s+([\w\s-]+)/i,
      /\b(météo|weather)\b\s+([\w\s-]+)/i,
    ],
    extractArgs: (msg) => {
      for (const pattern of [
        /\b(?:météo|weather|température)\b.*\b(?:pour|à|a|in|at|de|of)\b\s+([\w\s-]+)/i,
        /\b(?:météo|weather)\b\s+([\w\s-]+)/i,
      ]) {
        const match = msg.match(pattern);
        if (match?.[1]) return { location: match[1].trim() };
      }
      return null;
    },
    formatResult: (result) => {
      if (typeof result === "string") return `Météo: ${result.slice(0, 300)}`;
      return `Météo: ${JSON.stringify(result).slice(0, 300)}`;
    },
  },
  {
    toolName: "getCryptoPrice",
    patterns: [
      /\b(prix|price|cours|rate)\b.*\b(bitcoin|btc|ethereum|eth|solana|sol|doge|dogecoin|xrp|cardano|ada)\b/i,
      /\b(bitcoin|btc|ethereum|eth|solana|sol|doge|dogecoin|xrp|cardano|ada)\b.*\b(prix|price|cours|rate)\b/i,
    ],
    extractArgs: (msg) => {
      const cryptoMatch = msg.match(
        /\b(bitcoin|btc|ethereum|eth|solana|sol|doge|dogecoin|xrp|cardano|ada)\b/i,
      );
      if (cryptoMatch?.[1]) return { coin: cryptoMatch[1].toLowerCase() };
      return null;
    },
    formatResult: (result) => {
      if (typeof result === "string") return `Prix crypto: ${result.slice(0, 300)}`;
      return `Prix crypto: ${JSON.stringify(result).slice(0, 300)}`;
    },
  },
  {
    toolName: "get_nasa_apod",
    patterns: [/\b(nasa|apod|astronomy picture|photo du jour|image du jour)\b/i],
    extractArgs: () => ({}),
    formatResult: (result) => {
      if (typeof result === "string") return `NASA APOD: ${result.slice(0, 400)}`;
      return `NASA APOD: ${JSON.stringify(result).slice(0, 400)}`;
    },
  },
];

export function detectPrefetchableTool(
  message: string,
): { toolName: string; args: Record<string, any> } | null {
  const trimmed = normalizePrefetchText(message);

  // Trop long → probablement complexe, ne pas pré-fetch
  if (trimmed.length > 200) return null;

  for (const rule of PREFETCH_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed) || pattern.test(message)) {
        const args = rule.extractArgs(message);
        if (args) {
          logger.info(`[Prefetch] 🚀 Pre-executing ${rule.toolName} for "${trimmed.slice(0, 50)}"`);
          return { toolName: rule.toolName, args };
        }
      }
    }
  }

  return null;
}

export function formatPrefetchResult(toolName: string, result: any): string {
  const rule = PREFETCH_RULES.find((r) => r.toolName === toolName);
  if (!rule) return "";
  return rule.formatResult(result);
}
