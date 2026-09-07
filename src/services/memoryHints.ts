/**
 * Extraction locale de faits (jeux, surnoms, goûts) sans appel LLM.
 */
import { remember, type RememberOptions } from "./aiMemory.js";
import logger from "../utils/logger.js";

export interface SpokenFact {
  key: string;
  value: string;
  category: NonNullable<RememberOptions["category"]>;
}

function cleanValue(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/["«»]/g, "")
    .replace(/[.!?…]+$/g, "")
    .trim()
    .slice(0, 80);
}

const SKIP = /^(pas|rien|ça|ca|le|la|les|un|une|des|du|de|ce|cette|mon|ma|mes|quoi|truc)$/i;

export function extractSpokenFacts(text: string): SpokenFact[] {
  const facts: SpokenFact[] = [];
  const seen = new Set<string>();
  const push = (key: string, raw: string, category: SpokenFact["category"]) => {
    const value = cleanValue(raw);
    if (value.length < 2 || SKIP.test(value) || seen.has(key)) return;
    seen.add(key);
    facts.push({ key, value, category });
  };

  const patterns: Array<[RegExp, string, SpokenFact["category"]]> = [
    [
      /\bje\s+(?:m['']appelle|mappelle)\s+([^,.!?\n]{2,40}?)(?=\s+et\b|[.!?]|$)/gi,
      "surnom",
      "personal",
    ],
    [/\bappelle[- ]moi\s+([^,.!?\n]{2,40}?)(?=\s+et\b|[.!?]|$)/gi, "surnom", "personal"],
    [
      /\bmon\s+(?:surnom|pseudo|blaze)\s+(?:c['']est|est)\s+([^,.!?\n]{2,40}?)(?=\s+et\b|[.!?]|$)/gi,
      "surnom",
      "personal",
    ],
    [
      /\bje\s+(?:joue|jouais|kiffe jouer)\s+(?:à|au|aux|a)\s+([^,.!?\n]{2,40}?)(?=\s+et\b|[.!?]|$)/gi,
      "jeu",
      "game",
    ],
    [/\bje\s+main(?:e)?\s+([^,.!?\n]{2,40}?)(?=\s+et\b|[.!?]|$)/gi, "main", "game"],
    [
      /\bmon\s+jeu\s+(?:c['']est|est|préféré c['']est)\s+([^,.!?\n]{2,40}?)(?=\s+et\b|[.!?]|$)/gi,
      "jeu",
      "game",
    ],
    [
      /\bj[''](?:aime|adore|kiffe)\s+(?:bien\s+)?([^,.!?\n]{2,40}?)(?=\s+et\b|[.!?]|$)/gi,
      "aime",
      "preference",
    ],
    [
      /\bje\s+(?:déteste|deteste|kiffe pas|n['']aime pas)\s+([^,.!?\n]{2,40}?)(?=\s+et\b|[.!?]|$)/gi,
      "deteste",
      "opinion",
    ],
  ];

  for (const [re, key, category] of patterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      push(key, match[1], category);
    }
  }

  return facts.slice(0, 4);
}

const WAKE = /(?:^|[\s,])(?:(?:hé|hey|eh|oh|dis|yo)\s+)?john(?:\s|,|$|[?!])/i;

export function matchJohnWakeWord(text: string): { hit: boolean; prompt: string } {
  const trimmed = text.trim();
  if (!trimmed) return { hit: false, prompt: "" };
  if (!WAKE.test(trimmed)) return { hit: false, prompt: "" };
  const prompt = trimmed.replace(WAKE, " ").replace(/\s+/g, " ").trim();
  return { hit: true, prompt: prompt || "on t'a appelé dans le vocal, réponds court" };
}

export async function saveSpokenFacts(
  userId: string,
  text: string,
  sourceMsg?: string,
): Promise<number> {
  const facts = extractSpokenFacts(text);
  for (const fact of facts) {
    try {
      await remember(userId, fact.key, fact.value, {
        category: fact.category,
        sourceMsg,
      });
    } catch (err) {
      logger.debug(
        `[MemoryHints] remember failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return facts.length;
}
