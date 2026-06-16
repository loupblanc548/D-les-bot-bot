import type { Middleware } from "./compose";
/**
 * Middleware de logging pour les commandes slash.
 * - Log l'invocation (commande, utilisateur, guilde).
 * - Mesure la latence d'exécution.
 * - Log succès/échec via les méthodes Winston (Sentry est câblé sur `logger.error`).
 */
export declare function createLoggingMiddleware(): Middleware;
//# sourceMappingURL=logging.d.ts.map