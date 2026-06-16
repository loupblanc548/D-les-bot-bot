/**
 * Utilitaire centralisé pour la gestion des erreurs
 * Fournit des fonctions helpers pour logger les erreurs de manière cohérente
 */
export declare function logError(context: string, error: unknown, metadata?: Record<string, any>): void;
export declare function logWarn(context: string, message: string, metadata?: Record<string, any>): void;
export declare function logInfo(context: string, message: string, metadata?: Record<string, any>): void;
/**
 * Wrapper pour les fonctions async avec gestion d'erreur automatique
 */
export declare function safeAsync<T>(fn: () => Promise<T>, context: string, fallback?: T): Promise<T | undefined>;
/**
 * Wrapper pour les fonctions sync avec gestion d'erreur automatique
 */
export declare function safeSync<T>(fn: () => T, context: string, fallback?: T): T | undefined;
//# sourceMappingURL=error-handler.d.ts.map