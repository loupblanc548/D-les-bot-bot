/**
 * trivialFastPath.ts — Réponses instantanées sans API pour messages triviaux
 *
 * Détecte les messages simples (salutations, remerciements, emoji seuls, etc.)
 * et répond instantanément sans appeler l'API — économise des tokens et accélère.
 */

import logger from "../utils/logger.js";

interface TrivialResponse {
  patterns: RegExp[];
  responses: string[];
  variations?: boolean;
}

const TRIVIAL_RESPONSES: TrivialResponse[] = [
  // ─── Salutations ───
  {
    patterns: [/^\s*(salut|bonjour|hey|coucou|yo|hello|hi|cc|bonsoir)\s*$/i],
    responses: [
      "Yo ! ça roule ?",
      "Salut soldat, ça va ?",
      "Hey ! Quoi de neuf ?",
      "Coucou ! Prêt pour la démocratie ?",
      "Bonjour ! Toujours en forme ?",
      "Yo, quoi de beau ?",
    ],
    variations: true,
  },
  // ─── Remerciements ───
  {
    patterns: [/^\s*(merci|thanks|thx|cimer|merci beaucoup|merci bien)\s*$/i],
    responses: [
      "De rien soldat !",
      "Pas de souci !",
      "Avec plaisir !",
      "C'est mon boulot",
      "No problemo",
      "Tout le plaisir est pour moi",
    ],
    variations: true,
  },
  // ─── Acquiescements ───
  {
    patterns: [/^\s*(ok|okay|d'accord|compris|noted|vu|entendu)\s*$/i],
    responses: ["👌", "Compris !", "Noté soldat", "Ok, c'est bon", "👍"],
    variations: true,
  },
  // ─── Rires ───
  {
    patterns: [/^\s*(mdr|mdrr|lol|xd|haha|ahah|ptdr|ptdrr|xptdr)\s*$/i],
    responses: ["😂", "Franchement oui mdr", "Haha excellent", "Lol ça va le faire", "💀"],
    variations: true,
  },
  // ─── Accords/désaccords courts ───
  {
    patterns: [/^\s*(vrai|faux|graves|ouf|bref|nice|cool|gg|wp|ez|clairement|carrément)\s*$/i],
    responses: ["Franchement oui", "Carrément", "Grave", "Faut le faire", "Bien vu", "Yep", "Sans déconner"],
    variations: true,
  },
  // ─── Emoji seuls ───
  {
    patterns: [/^\s*[\p{Emoji}\s]+$/u],
    responses: ["👍", "😂", "👌", "💯", "🫡"],
    variations: true,
  },
  // ─── "Comment ça va" ───
  {
    patterns: [/^\s*(ça va|ca va|comment ça va|comment ca va|tu vas bien|how are you)\s*[\?？]?\s*$/i],
    responses: [
      "Ça roule, et toi ?",
      "Tranquille, toujours en mission ! Et toi ?",
      "Ça va le soldat, prêt à libérer la galaxie !",
      "Pas mal, quoi de ton côté ?",
    ],
    variations: true,
  },
  // ─── "Qui es-tu" ───
  {
    patterns: [/^\s*(qui es.tu|tu es qui|t'es qui|présente.toi|who are you)\s*[\?？]?\s*$/i],
    responses: [
      "John Helldiver, vétéran de la Super-Terre, à ton service",
      "Moi c'est John, je traîne ici depuis un moment",
      "John, soldat de la Super-Terre, toujours prêt",
    ],
    variations: true,
  },
];

// Cache pour éviter de répéter la même réponse au même utilisateur
const userResponseCache = new Map<string, Map<string, number>>();

function pickResponse(responses: string[], userId: string, patternKey: string): string {
  // Éviter de répéter la dernière réponse au même utilisateur
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

  // Trop long → pas trivial
  if (trimmed.length > 60) return null;

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

// Nettoyage périodique du cache
setInterval(() => {
  if (userResponseCache.size > 500) {
    userResponseCache.clear();
  }
}, 60 * 60 * 1000).unref();
