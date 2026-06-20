import logger from "./logger.js";
/**
 * Utilitaire centralisé pour la gestion des erreurs
 * Fournit des fonctions helpers pour logger les erreurs de manière cohérente
 */
export function logError(context, error, metadata) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(`[${context}] ${errorMessage}`, metadata ? { ...metadata, stack: errorStack } : errorStack);
}
export function logWarn(context, message, metadata) {
    logger.warn(`[${context}] ${message}`, metadata);
}
export function logInfo(context, message, metadata) {
    logger.info(`[${context}] ${message}`, metadata);
}
/**
 * Wrapper pour les fonctions async avec gestion d'erreur automatique
 */
export async function safeAsync(fn, context, fallback) {
    try {
        return await fn();
    }
    catch (error) {
        logError(context, error);
        return fallback;
    }
}
/**
 * Wrapper pour les fonctions sync avec gestion d'erreur automatique
 */
export function safeSync(fn, context, fallback) {
    try {
        return fn();
    }
    catch (error) {
        logError(context, error);
        return fallback;
    }
}
//# sourceMappingURL=error-handler.js.map