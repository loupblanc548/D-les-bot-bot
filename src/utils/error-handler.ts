import logger from "./logger";

/**
 * Utilitaire centralisé pour la gestion des erreurs
 * Fournit des fonctions helpers pour logger les erreurs de manière cohérente
 */

export function logError(context: string, error: unknown, metadata?: Record<string, any>) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error(`[${context}] ${errorMessage}`, metadata ? { ...metadata, stack: errorStack } : errorStack);
}

export function logWarn(context: string, message: string, metadata?: Record<string, any>) {
  logger.warn(`[${context}] ${message}`, metadata);
}

export function logInfo(context: string, message: string, metadata?: Record<string, any>) {
  logger.info(`[${context}] ${message}`, metadata);
}

/**
 * Wrapper pour les fonctions async avec gestion d'erreur automatique
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    logError(context, error);
    return fallback;
  }
}

/**
 * Wrapper pour les fonctions sync avec gestion d'erreur automatique
 */
export function safeSync<T>(
  fn: () => T,
  context: string,
  fallback?: T
): T | undefined {
  try {
    return fn();
  } catch (error) {
    logError(context, error);
    return fallback;
  }
}
