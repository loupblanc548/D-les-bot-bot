/**
 * Simple metrics collection for monitoring cron job performance
 * with time-series history and period-based aggregation support.
 *
 * Le selecteur de periode "1h" renvoie desormais 60 minutes de donnees
 * agreeees (delta) plutot que 60 points de polling bruts.
 */
interface Metrics {
    totalProcessed: number;
    totalErrors: number;
    totalSuccess: number;
    lastProcessed: Date | null;
    averageProcessingTime: number;
}
/**
 * Snapshot temporel d''un etat de metriques a un instant T.
 */
interface TimeSeriesSnapshot {
    timestamp: number;
    totalProcessed: number;
    totalErrors: number;
    totalSuccess: number;
    averageProcessingTime: number;
}
/**
 * Resultat agreee pour une periode donnee.
 */
export interface AggregatedPeriodMetrics {
    periodLabel: string;
    periodMs: number;
    snapshotCount: number;
    processedInPeriod: number;
    errorsInPeriod: number;
    successInPeriod: number;
    successRate: number;
    averageProcessingTime: number;
    throughputPerMinute: number;
}
declare class MetricsCollector {
    private metrics;
    private timeSeriesHistory;
    private readonly MAX_SNAPSHOTS_PER_JOB;
    recordProcessing(jobName: string, success: boolean, processingTimeMs: number): void;
    recordSnapshot(jobName: string): void;
    getMetricsForPeriod(jobName: string, periodMs: number, periodLabel: string): AggregatedPeriodMetrics | null;
    getMetricsForStandardPeriods(jobName: string): {
        "1h": AggregatedPeriodMetrics | null;
        "6h": AggregatedPeriodMetrics | null;
        "24h": AggregatedPeriodMetrics | null;
    };
    getAggregatedSummaryForPeriod(periodMs: number, periodLabel: string): AggregatedPeriodMetrics | null;
    getMetrics(jobName: string): Metrics | undefined;
    getAllMetrics(): Map<string, Metrics>;
    getTimeSeriesHistory(jobName: string): TimeSeriesSnapshot[];
    resetMetrics(jobName: string): void;
    resetAllMetrics(): void;
}
export declare const metricsCollector: MetricsCollector;
export {};
//# sourceMappingURL=metrics.d.ts.map