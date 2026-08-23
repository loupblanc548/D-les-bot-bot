/**
 * aiFallbackHelpers.ts — Helpers partagés pour la détection d'erreurs IA
 *
 * Délègue maintenant au classifieur unique responseClassifier.ts.
 * Conservé pour rétro-compatibilité avec les imports existants.
 */

import {
  isHallucinatedError,
  isErrorResponse,
  sanitizeResponse,
  FALLBACK_MESSAGE,
} from "./responseClassifier.js";

export {
  isHallucinatedError as isAiHallucinatedError,
  isErrorResponse as isStillError,
  sanitizeResponse,
  FALLBACK_MESSAGE as DEFAULT_ERROR_MESSAGE,
};
