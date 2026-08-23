/**
 * responseClassifier.ts — Classifieur unique pour les réponses IA
 *
 * Catégories explicites:
 *  - technical_error: message d'erreur technique hardcodé
 *  - hallucinated_error: l'IA a inventé un message d'erreur sur la disponibilité
 *  - empty: réponse vide ou trop courte
 *  - valid: réponse normale et utilisable
 *
 * Remplace les patterns éparpillés dans aiFallbackHelpers.ts et chatResponder.ts.
 */

export type ResponseCategory = "technical_error" | "hallucinated_error" | "empty" | "valid";

// ─── Patterns d'erreurs techniques (hardcodés, non générés par l'IA) ─────────

const TECHNICAL_ERROR_PATTERNS = [
  /Le serveur IA a rencontr[ée] un probl[èe]me/i,
  /Probl[èe]me de communication avec le serveur IA/i,
  /Le serveur IA est sous forte charge/i,
  /CIRCUIT BREAKER ACTIVATED/i,
  /Circuit breaker activated/i,
  /kill switch est activ[ée]/i,
];

// ─── Patterns d'hallucinations (l'IA invente des erreurs de disponibilité) ───

const HALLUCINATED_ERROR_PATTERNS = [
  /temporairement indisponibles?/i,
  /tous les mod[èe]les (IA|d'IA)/i,
  /mod[èe]les (IA|d'IA) sont temporairement/i,
  /quota\/cooldown/i,
  /r[ée]essaie dans 1-2 minutes/i,
  /serveur IA (a rencontr[ée]|est sous forte charge)/i,
  /probl[èe]me de communication avec le serveur IA/i,
  /circuit breaker/i,
  /je ne peux pas r[ée]pondre.*(quota|indisponible|mod[èe]le)/i,
  /aucun mod[èe]le (n'est )?disponible/i,
  /momentan[ée]ment indisponible/i,
];

// ─── Seuil de réponse vide ────────────────────────────────────────────────────

const EMPTY_THRESHOLD = 2; // Moins de 2 caractères = vide

// ─── API publique ────────────────────────────────────────────────────────────

/**
 * Classifie une réponse IA en une des 4 catégories.
 * Retourne la catégorie ET un booléen `isValid` pour usage rapide.
 */
export function classifyResponse(text: string): {
  category: ResponseCategory;
  isValid: boolean;
} {
  if (!text || text.trim().length < EMPTY_THRESHOLD) {
    return { category: "empty", isValid: false };
  }

  if (TECHNICAL_ERROR_PATTERNS.some((p) => p.test(text))) {
    return { category: "technical_error", isValid: false };
  }

  if (HALLUCINATED_ERROR_PATTERNS.some((p) => p.test(text))) {
    return { category: "hallucinated_error", isValid: false };
  }

  return { category: "valid", isValid: true };
}

/**
 * Vrai si la réponse est une erreur technique, une hallucination, ou vide.
 */
export function isErrorResponse(text: string): boolean {
  const { category } = classifyResponse(text);
  return (
    category === "technical_error" || category === "hallucinated_error" || category === "empty"
  );
}

/**
 * Vrai si la réponse est une hallucination (erreur inventée par l'IA).
 */
export function isHallucinatedError(text: string): boolean {
  return classifyResponse(text).category === "hallucinated_error";
}

/**
 * Vrai si la réponse est vide ou trop courte.
 */
export function isEmptyResponse(text: string): boolean {
  return classifyResponse(text).category === "empty";
}

/**
 * Nettoie une réponse: supprime les lignes qui hallucinent des erreurs
 * tout en conservant le reste du contenu utile.
 */
export function sanitizeResponse(text: string): string {
  const lines = text.split("\n");
  const kept = lines.filter(
    (line) =>
      !HALLUCINATED_ERROR_PATTERNS.some((p) => p.test(line)) &&
      !TECHNICAL_ERROR_PATTERNS.some((p) => p.test(line)),
  );
  return kept.join("\n").trim();
}

/**
 * Message de repli conversationnel quand tout échoue.
 */
export const FALLBACK_MESSAGE =
  "Hmm, j'ai eu un petit blanc… Repose-moi ta question, je te réponds tout de suite, soldat.";
