import { register } from "prom-client";
export declare const metrics: {
    incrementCommand: (command: string, guildId?: string) => void;
    incrementMessage: (guildId?: string, channelId?: string) => void;
    recordInteraction: (type: string, duration: number) => void;
    incrementApiRequest: (service: string, method: string, status: string) => void;
    recordApiRequest: (service: string, duration: number) => void;
    incrementError: (type: string, module: string) => void;
    incrementRateLimit: (guildId?: string, type?: string) => void;
};
/**
 * Endpoint Prometheus amélioré exposant des métriques du bot.
 * Accessible sur /metrics (port 3005 par défaut).
 */
export declare function startMetricsServer(port?: number): void;
export declare function stopMetricsServer(): void;
export { register };
//# sourceMappingURL=metrics.d.ts.map