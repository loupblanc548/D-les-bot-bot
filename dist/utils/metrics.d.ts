/**
 * Simple metrics collection for monitoring cron job performance
 */
interface Metrics {
    totalProcessed: number;
    totalErrors: number;
    totalSuccess: number;
    lastProcessed: Date | null;
    averageProcessingTime: number;
}
declare class MetricsCollector {
    private metrics;
    recordProcessing(jobName: string, success: boolean, processingTimeMs: number): void;
    getMetrics(jobName: string): Metrics | undefined;
    getAllMetrics(): Map<string, Metrics>;
    resetMetrics(jobName: string): void;
    resetAllMetrics(): void;
}
export declare const metricsCollector: MetricsCollector;
export {};
//# sourceMappingURL=metrics.d.ts.map