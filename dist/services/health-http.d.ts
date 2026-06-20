/**
 * Démarre un serveur HTTP amélioré pour le health check.
 * Utilisé par Docker, Kubernetes, ou monitoring externe.
 *
 * Endpoints:
 * - GET /health - Basic health check (database only)
 * - GET /health/ready - Readiness probe (all critical services)
 * - GET /health/live - Liveness probe (process is running)
 * - GET /health/detailed - Full health check with all modules
 */
export declare function startHealthServer(port?: number): void;
export declare function stopHealthServer(): void;
//# sourceMappingURL=health-http.d.ts.map