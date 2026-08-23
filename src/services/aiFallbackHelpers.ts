/**
 * aiFallbackHelpers.ts — Helpers partagés pour la détection d'erreurs IA
 *
 * Extrait de messages.ts pour réutilisation dans d'autres modules
 * (control-server, workerRuntime, etc.)
 */

/**
 * Détecte si l'IA a halluciné un message d'erreur sur la disponibilité des modèles.
 * L'IA génère parfois ces messages au lieu de répondre normalement.
 */
export function isAiHallucinatedError(text: string): boolean {
  return (
    text.includes("temporairement indisponibles") ||
    text.includes("quota/cooldown") ||
    text.includes("Tous les modèles IA") ||
    text.includes("modèles IA sont temporairement") ||
    text.includes("Réessaie dans 1-2 minutes")
  );
}

/**
 * Détecte si le texte est un message d'erreur connu (hardcodé ou halluciné par l'IA).
 * Utilisé pour décider si on doit tenter un fallback.
 */
export function isStillError(text: string): boolean {
  return (
    !text ||
    text.includes("Le serveur IA a rencontré un problème") ||
    text.includes("Problème de communication avec le serveur IA") ||
    text.includes("Le serveur IA est sous forte charge") ||
    text.includes("CIRCUIT BREAKER ACTIVATED") ||
    text.includes("Circuit breaker activated") ||
    isAiHallucinatedError(text)
  );
}

/**
 * Message d'erreur par défaut quand tous les fallbacks échouent
 */
export const DEFAULT_ERROR_MESSAGE =
  "⚠️ Je n'ai pas obtenu de réponse cette fois. Les providers ont été basculés automatiquement ; réessaie dans quelques secondes, soldat.";
