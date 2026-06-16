"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logError = logError;
exports.logWarn = logWarn;
exports.logInfo = logInfo;
exports.safeAsync = safeAsync;
exports.safeSync = safeSync;
const logger_1 = __importDefault(require("./logger"));
/**
 * Utilitaire centralisé pour la gestion des erreurs
 * Fournit des fonctions helpers pour logger les erreurs de manière cohérente
 */
function logError(context, error, metadata) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger_1.default.error(`[${context}] ${errorMessage}`, metadata ? { ...metadata, stack: errorStack } : errorStack);
}
function logWarn(context, message, metadata) {
    logger_1.default.warn(`[${context}] ${message}`, metadata);
}
function logInfo(context, message, metadata) {
    logger_1.default.info(`[${context}] ${message}`, metadata);
}
/**
 * Wrapper pour les fonctions async avec gestion d'erreur automatique
 */
async function safeAsync(fn, context, fallback) {
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
function safeSync(fn, context, fallback) {
    try {
        return fn();
    }
    catch (error) {
        logError(context, error);
        return fallback;
    }
}
//# sourceMappingURL=error-handler.js.map