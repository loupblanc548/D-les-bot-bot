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
      return `Casier / logs — une fiche Discord a déjà été postée. Une phrase suffit, pas de markdown | col | :\n${text.slice(0, 1500)}`;
    },
  },
  {
    toolName: "networkDefenseBrief",
    patterns: [
      /\b(d[eé]fense|prot[eé]ger|se prot[eé]ger|parade|hardening)\b[\s\S]{0,80}\b(nmap|hydra|ettercap|hashcat|metasploit|wifite|searchsploit)\b/i,
      /\b(nmap|hydra|ettercap|hashcat|metasploit|wifite|searchsploit)\b[\s\S]{0,80}\b(d[eé]fense|prot[eé]ger|se prot[eé]ger|parade)\b/i,
      /\b(cheat\s*sheet|fiche)\b[\s\S]{0,60}\b(kali|nmap|hydra)\b/i,
      /\bnmap\b[\s\S]{0,120}\bhydra\b[\s\S]{0,120}\b(ettercap|hashcat|metasploit|wifite|searchsploit)\b/i,
    ],
    extractArgs: (msg) => {
      const names = [
        "nmap",
        "hydra",
        "ettercap",
        "hashcat",
        "metasploit",
        "wifite",
        "searchsploit",
      ];
      const hits = names.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(msg));
      return hits.length === 1 ? { tool: hits[0] } : {};
    },
    formatResult: (result) => {
      const text = typeof result === "string" ? result : JSON.stringify(result);
      return `Défense réseau — fiche déjà postée. Une phrase, pas de commandes Kali :\n${text.slice(0, 1500)}`;
    },
  },
  {
    toolName: "domainFiche",
    patterns: [
      /\b(fiche|playbook|digest hebdo|signaux multi|anti-spam|fuite|have\s*i\s*been\s*pwned|\bhibp\b)\b/i,
      /\b(sante|santé)\b[\s\S]{0,40}\b(bot|pm2|vps)\b/i,
      /\bcertificat\b[\s\S]{0,40}\b(ssl|expir)/i,
      /\b(fiche|carte)\b[\s\S]{0,40}\b(steam|twitch|nasa|m[eé]t[eé]o|accueil|bienvenue)\b/i,
    ],
    extractArgs: (msg) => {
      const lower = msg.toLowerCase();
      if (/\bhibp\b|have\s*i\s*been|fuite/.test(lower)) {
        const email = msg.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
        return { domain: "securite", sujet: "hibp", query: email?.[0] };
      }
      if (/ssl|certificat/.test(lower)) return { domain: "securite", sujet: "ssl" };
      if (/digest/.test(lower)) return { domain: "communaute", sujet: "digest" };
      if (/sant[eé]/.test(lower)) return { domain: "devops", sujet: "sante" };
      if (/nasa|apod/.test(lower)) return { domain: "science", sujet: "nasa" };
      if (/bienvenue|accueil|r[eè]gles/.test(lower))
        return { domain: "communaute", sujet: "bienvenue" };
      if (/multi-?compte|alts?/.test(lower)) return { domain: "moderation", sujet: "multi" };
      return { domain: undefined };
    },
    formatResult: (result) => {
      const text = typeof result === "string" ? result : JSON.stringify(result);
      return `Fiche Discord déjà postée. Une phrase, pas de markdown | col | :\n${text.slice(0, 1500)}`;
    },
  },
  {
    toolName: "snowflakeDecode",
    patterns: [/\b(snowflake|d[ée]code).{0,20}\b\d{17,20}\b/i, /\bid discord\b.{0,10}\d{17,20}/i],
    extractArgs: (msg) => {
      const id = msg.match(/\b(\d{17,20})\b/);
      return id ? { id: id[1] } : null;
    },
    formatResult: (result) => `Snowflake : ${String(result).slice(0, 400)}`,
  },
  {
    toolName: "holidaysFr",
    patterns: [/\bjours?\s+f[ée]ri[ée]s?\b/i, /\bf[ée]ri[ée]\s+(en\s+)?france\b/i],
    extractArgs: (msg) => {
      const year = msg.match(/\b(20\d{2})\b/);
      return year ? { year: year[1] } : {};
    },
    formatResult: (result) => `Jours fériés : ${String(result).slice(0, 500)}`,
  },
  {
    toolName: "platformStatus",
    patterns: [
      /\b(steam|psn|playstation|xbox|epic|riot)\b.{0,20}\b(down|hs|en panne|status|statut)\b/i,
      /\b(down|hs|en panne)\b.{0,20}\b(steam|psn|xbox|epic|riot)\b/i,
    ],
    extractArgs: (msg) => {
      const m = msg.toLowerCase();
      if (m.includes("steam")) return { platform: "steam" };
      if (m.includes("psn") || m.includes("playstation")) return { platform: "psn" };
      if (m.includes("xbox")) return { platform: "xbox" };
      if (m.includes("epic")) return { platform: "epic" };
      if (m.includes("riot")) return { platform: "riot" };
      return { platform: "steam" };
    },
    formatResult: (result) => `Statut plateforme : ${String(result).slice(0, 400)}`,
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
    toolName: "getNasaApod",
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
