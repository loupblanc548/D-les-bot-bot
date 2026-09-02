/**
 * trivialFastPath.ts — Réponses instantanées sans API pour messages ultra-courts
 *
 * Uniquement ok / lol / emoji / gg. Les salutations, « ça va », « qui es-tu »
 * passent par l'IA — une IA généraliste ne doit pas répondre en conserve.
 */

import logger from "../utils/logger.js";

interface TrivialResponse {
  patterns: RegExp[];
  responses: string[];
}

const TRIVIAL_RESPONSES: TrivialResponse[] = [
  {
    patterns: [/^\s*(ok|okay|d'accord|compris|noted|vu|entendu)\s*$/i],
    responses: ["👌", "Compris", "Ok", "👍"],
  },
  {
    patterns: [/^\s*(mdr|mdrr|lol|xd|haha|ahah|ptdr|ptdrr|xptdr)\s*$/i],
    responses: ["😂", "Haha", "Lol", "💀"],
  },
  {
    patterns: [/^\s*(vrai|faux|graves|ouf|bref|nice|cool|gg|wp|ez|clairement|carrément)\s*$/i],
    responses: ["Yep", "Carrément", "Grave", "Bien vu"],
  },
  {
    patterns: [/^\s*[\p{Emoji}\s]+$/u],
    responses: ["👍", "😂", "👌", "💯"],
  },
];

const userResponseCache = new Map<string, Map<string, number>>();

function pickResponse(responses: string[], userId: string, patternKey: string): string {
  if (!userResponseCache.has(userId)) {
    userResponseCache.set(userId, new Map());
  }
  const userCache = userResponseCache.get(userId)!;
  const lastIdx = userCache.get(patternKey) ?? -1;

  let idx = Math.floor(Math.random() * responses.length);
  if (responses.length > 1 && idx === lastIdx) {
    idx = (idx + 1) % responses.length;
  }
  userCache.set(patternKey, idx);
  return responses[idx];
}

export function getTrivialResponse(message: string, userId: string): string | null {
  const trimmed = message.trim();

  if (trimmed.length > 40) return null;

  for (let i = 0; i < TRIVIAL_RESPONSES.length; i++) {
    const entry = TRIVIAL_RESPONSES[i];
    for (const pattern of entry.patterns) {
      if (pattern.test(trimmed)) {
        const response = pickResponse(entry.responses, userId, `trivial_${i}`);
        logger.debug(`[FastPath] Trivial response for "${trimmed}" → "${response}"`);
        return response;
      }
    }
  }

  return null;
}

setInterval(
  () => {
    if (userResponseCache.size > 500) {
      userResponseCache.clear();
    }
  },
  60 * 60 * 1000,
).unref();
