/**
 * Simple metrics collection for monitoring cron job performance
 * with time-series history and period-based aggregation support.
 *
 * Le selecteur de periode "1h" renvoie desormais 60 minutes de donnees
 * agreeees (delta) plutot que 60 points de polling bruts.
 */
class MetricsCollector {
    metrics = new Map();
    timeSeriesHistory = new Map();
    MAX_SNAPSHOTS_PER_JOB = 1440;
    recordProcessing(jobName, success, processingTimeMs) {
        const current = this.metrics.get(jobName) || {
            totalProcessed: 0,
            totalErrors: 0,
            totalSuccess: 0,
            lastProcessed: null,
            averageProcessingTime: 0,
        };
        current.totalProcessed++;
        if (success) {
            current.totalSuccess++;
        }
        else {
            current.totalErrors++;
        }
        current.lastProcessed = new Date();
        current.averageProcessingTime =
            (current.averageProcessingTime * (current.totalProcessed - 1) + processingTimeMs) / current.totalProcessed;
        this.metrics.set(jobName, current);
    }
    recordSnapshot(jobName) {
        const current = this.metrics.get(jobName);
        if (!current)
            return;
        if (!this.timeSeriesHistory.has(jobName)) {
            this.timeSeriesHistory.set(jobName, []);
        }
        const history = this.timeSeriesHistory.get(jobName);
        const snapshot = {
            timestamp: Date.now(),
            totalProcessed: current.totalProcessed,
            totalErrors: current.totalErrors,
            totalSuccess: current.totalSuccess,
            averageProcessingTime: current.averageProcessingTime,
        };
        const lastSnap = history[history.length - 1];
        if (lastSnap &&
            lastSnap.totalProcessed === snapshot.totalProcessed &&
            lastSnap.totalErrors === snapshot.totalErrors &&
            lastSnap.totalSuccess === snapshot.totalSuccess &&
            lastSnap.averageProcessingTime === snapshot.averageProcessingTime) {
            return;
        }
        history.push(snapshot);
        while (history.length > this.MAX_SNAPSHOTS_PER_JOB) {
            history.shift();
        }
    }
    getMetricsForPeriod(jobName, periodMs, periodLabel) {
        const history = this.timeSeriesHistory.get(jobName);
        if (!history || history.length === 0)
            return null;
        const cutoffTime = Date.now() - periodMs;
        const snapshotsInPeriod = history.filter(s => s.timestamp >= cutoffTime);
        if (snapshotsInPeriod.length < 2) {
            const latest = history[history.length - 1];
            return {
                periodLabel,
                periodMs,
                snapshotCount: snapshotsInPeriod.length,
                processedInPeriod: 0,
                errorsInPeriod: 0,
                successInPeriod: 0,
                successRate: latest.totalProcessed > 0
                    ? (latest.totalSuccess / latest.totalProcessed) * 100
                    : 0,
                averageProcessingTime: latest.averageProcessingTime,
                throughputPerMinute: 0,
            };
        }
        const first = snapshotsInPeriod[0];
        const last = snapshotsInPeriod[snapshotsInPeriod.length - 1];
        let processedDelta = last.totalProcessed - first.totalProcessed;
        let errorsDelta = last.totalErrors - first.totalErrors;
        let successDelta = last.totalSuccess - first.totalSuccess;
        if (processedDelta < 0) {
            processedDelta = last.totalProcessed;
            errorsDelta = last.totalErrors;
            successDelta = last.totalSuccess;
        }
        const timeSpanMinutes = (last.timestamp - first.timestamp) / 60000;
        const throughputPerMinute = timeSpanMinutes > 0
            ? processedDelta / timeSpanMinutes
            : processedDelta;
        return {
            periodLabel,
            periodMs,
            snapshotCount: snapshotsInPeriod.length,
            processedInPeriod: processedDelta,
            errorsInPeriod: errorsDelta,
            successInPeriod: successDelta,
            successRate: processedDelta > 0
                ? (successDelta / processedDelta) * 100
                : 100,
            averageProcessingTime: snapshotsInPeriod.reduce((sum, s) => sum + s.averageProcessingTime, 0) / snapshotsInPeriod.length,
            throughputPerMinute: Math.round(throughputPerMinute * 100) / 100,
        };
    }
    getMetricsForStandardPeriods(jobName) {
        return {
            "1h": this.getMetricsForPeriod(jobName, 60 * 60 * 1000, "1h"),
            "6h": this.getMetricsForPeriod(jobName, 6 * 60 * 60 * 1000, "6h"),
            "24h": this.getMetricsForPeriod(jobName, 24 * 60 * 60 * 1000, "24h"),
        };
    }
    getAggregatedSummaryForPeriod(periodMs, periodLabel) {
        let totalProcessed = 0;
        let totalErrors = 0;
        let totalSuccess = 0;
        let totalSnapshots = 0;
        let avgTimeSum = 0;
        let avgTimeCount = 0;
        for (const jobName of this.metrics.keys()) {
            const jobMetrics = this.getMetricsForPeriod(jobName, periodMs, periodLabel);
            if (jobMetrics) {
                totalProcessed += jobMetrics.processedInPeriod;
                totalErrors += jobMetrics.errorsInPeriod;
                totalSuccess += jobMetrics.successInPeriod;
                totalSnapshots += jobMetrics.snapshotCount;
                avgTimeSum += jobMetrics.averageProcessingTime;
                avgTimeCount++;
            }
        }
        if (avgTimeCount === 0)
            return null;
        return {
            periodLabel,
            periodMs,
            snapshotCount: totalSnapshots,
            processedInPeriod: totalProcessed,
            errorsInPeriod: totalErrors,
            successInPeriod: totalSuccess,
            successRate: totalProcessed > 0 ? (totalSuccess / totalProcessed) * 100 : 100,
            averageProcessingTime: avgTimeSum / avgTimeCount,
            throughputPerMinute: totalProcessed > 0 ? Math.round((totalProcessed / (periodMs / 60000)) * 100) / 100 : 0,
        };
    }
    getMetrics(jobName) {
        return this.metrics.get(jobName);
    }
    getAllMetrics() {
        return new Map(this.metrics);
    }
    getTimeSeriesHistory(jobName) {
        return [...(this.timeSeriesHistory.get(jobName) || [])];
    }
    resetMetrics(jobName) {
        this.metrics.delete(jobName);
        this.timeSeriesHistory.delete(jobName);
    }
    resetAllMetrics() {
        this.metrics.clear();
        this.timeSeriesHistory.clear();
    }
}
export const metricsCollector = new MetricsCollector();
//# sourceMappingURL=metrics.js.map