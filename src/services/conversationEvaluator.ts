/**
 * conversationEvaluator.ts — Heuristic "should I respond?" gate
 *
 * Décide, via règles locales (sans appel API), si le bot doit répondre à un
 * message entrants selon 8 heuristiques explicites (DM, mention, taille,
 * emoji-only, anti-spam du bot, question, réponse à question du bot, défaut).
 *
 * Préférer ce module à un appel LLM quand le coût/latence importe plus que
 * la nuance sémantique — idéal pour réagir vite dans les salons textuels.
 */

import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export interface EvalResult {
  shouldRespond: boolean;
  reason: string;
  confidence: number;
}

// ─── Constantes ───────────────────────────────────────────────────

/** Longueur minimale en-dessous de laquelle un message est considéré vide/insignifiant. */
const MIN_MEANINGFUL_LENGTH = 5;

/** Regex Unicode couvrant les symboles/émoji (autorise les espaces entre eux). */
const EMOJI_ONLY_REGEX =
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\s]+$/u;

/** Un ID Discord (snowflake) est une chaîne purement numérique de 17-19 chiffres. */
const DISCORD_ID_REGEX = /^\d{17,19}$/;

// ─── Helpers ──────────────────────────────────────────────────────

/** Retire les mentions Discord en début de message pour évaluer le contenu restant. */
function stripLeadingMentions(message: string): string {
  return message.replace(/^(<@!?\d+>\s*)+/, "").trim();
}

/**
 * Le message contient-il une mention du bot ?
 *
 * Supporte deux formes, ce qui rend la fonction robuste quel que soit le
 * format du `botName`/`botId` fourni par l'appelant :
 *  - `<@1234567890>` / `<@!1234567890>` : vraie mention Discord (snowflake)
 *  - `@BuffyBot` : mention textuelle (plain text, avec word boundary)
 *
 * Le mode est choisi automatiquement selon que la valeur ressemble à un
 * snowflake Discord (`/^\d{17,19}$/`).
 */
function containsBotMention(message: string, botRef: string): boolean {
  if (!botRef) return false;
  if (DISCORD_ID_REGEX.test(botRef)) {
    const escaped = botRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`<@!?${escaped}>`).test(message);
  }
  // Plain-text @name : insensible à la casse, délimité pour éviter "BuffyBotExtra".
  const escapedName = botRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)@${escapedName}\\b`, "i").test(message);
}

/** Le message (nettoyé des mentions) est-il résumable à un seul emoji ou une réaction ? */
function isEmojiOnly(message: string): boolean {
  const stripped = stripLeadingMentions(message);
  if (stripped.length === 0) return false;
  return EMOJI_ONLY_REGEX.test(stripped);
}

/** Le message (nettoyé) est-il trop court et n'est PAS une question ? */
function isTooShortNonQuestion(message: string): boolean {
  const stripped = stripLeadingMentions(message);
  if (stripped.length >= MIN_MEANINGFUL_LENGTH) return false;
  // Un message très court peut quand même être une question (ex: "ça ?").
  return !stripped.includes("?");
}

/** Le message se termine-t-il par un point d'interrogation ? */
function containsQuestionMark(message: string): boolean {
  return stripLeadingMentions(message).includes("?");
}

/**
 * Le bot a-t-il posé une question dans son dernier message connu ?
 *
 * IMPORTANT : la signature `recentMessages: string[]` ne porte aucune
 * information d'auteur. On applique la convention suivante, qui est la
 * lecture la plus utile du contrat : le DERNIER message de la liste est
 * celui du bot (le caller est libre de pré-filtrer / trier).
 */
function lastBotMessageAskedQuestion(recentMessages: string[]): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (typeof msg !== "string") continue;
    if (msg.trim().length === 0) continue;
    return msg.includes("?");
  }
  return false;
}

/**
 * Les N derniers messages sont-ils TOUS du bot (anti-boucle) ?
 *
 * IMPORTANT : avec un `string[]` sans info d'auteur, on s'appuie sur la
 * convention que le caller passe un segment déjà filtré (ex :
 * `recentMessages.filter(m => m.authorId === botId).slice(-3)`). On
 * vérifie uniquement que ces N entrées sont non vides.
 */
function lastMessagesAreAllFromBot(recentMessages: string[], count: number): boolean {
  if (recentMessages.length < count) return false;
  const tail = recentMessages.slice(-count);
  return tail.every((m) => typeof m === "string" && m.trim().length > 0);
}

// ─── Évaluateur principal ────────────────────────────────────────

/**
 * Décide si le bot doit répondre à `message` selon les heuristiques locales.
 *
 * Règles (dans l'ordre d'évaluation — première règle gagnante) :
 *  1. DM            → toujours répondre (confiance 1.0)
 *  2. Mention du bot → répondre (1.0)
 *  3. Message < 5 chars et pas une question → NE PAS répondre (0.95)
 *  4. Emoji / réaction pure → NE PAS répondre (0.9)
 *  5. Trois derniers messages = bot → NE PAS répondre (0.85 — anti-spam)
 *  6. Message contient "?" → répondre (0.8)
 *  7. Réponse à une question posée par le bot → répondre (0.75)
 *  8. Sinon → NE PAS répondre, default 0.5
 *
 * Aucune requête réseau n'est émise — c'est volontaire et rapide.
 */
export async function evaluateShouldRespond(
  message: string,
  botName: string,
  isDM: boolean,
  recentMessages: string[] = [],
): Promise<EvalResult> {
  // 1) DM : toujours présent.
  if (isDM) {
    return { shouldRespond: true, reason: "DM privé", confidence: 1.0 };
  }

  // 2) Mention directe du bot via @username ou <@id>.
  if (botName && containsBotMention(message, botName)) {
    return { shouldRespond: true, reason: `Mention de @${botName}`, confidence: 1.0 };
  }

  // 3) Emoji / réaction pure — vérifié AVANT la règle "trop court" pour
  //    que les messages emoji-only reçoivent une raison/confidence
  //    sémantiquement correcte ("emoji") plutôt que "trop court".
  if (isEmojiOnly(message)) {
    return { shouldRespond: false, reason: "Emoji ou réaction uniquement", confidence: 0.9 };
  }

  // 4) Message trop court (et pas une question).
  if (isTooShortNonQuestion(message)) {
    return { shouldRespond: false, reason: "Message trop court", confidence: 0.95 };
  }

  // 5) Anti-spam : le bot monopolise le fil depuis 3 messages.
  if (lastMessagesAreAllFromBot(recentMessages, 3)) {
    return {
      shouldRespond: false,
      reason: "Les 3 derniers messages viennent du bot (anti-spam)",
      confidence: 0.85,
    };
  }

  // 6) Question explicite de l'utilisateur.
  if (containsQuestionMark(message)) {
    return { shouldRespond: true, reason: "Question détectée", confidence: 0.8 };
  }

  // 7) L'utilisateur répond à une question posée par le bot.
  if (lastBotMessageAskedQuestion(recentMessages)) {
    return { shouldRespond: true, reason: "Réponse à une question du bot", confidence: 0.75 };
  }

  // 8) Défaut : on s'abstient par prudence, confiance médiocre.
  logger.debug(
    `[conversationEvaluator] Pas de signal fort pour: ${message.slice(0, 80)}`,
  );
  return { shouldRespond: false, reason: "Aucun signal fort", confidence: 0.5 };
}
