"use strict";
/**
 * Simple metrics collection for monitoring cron job performance
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsCollector = void 0;
class MetricsCollector {
    metrics = new Map();
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
        // Update average processing time
        current.averageProcessingTime =
            (current.averageProcessingTime * (current.totalProcessed - 1) + processingTimeMs) / current.totalProcessed;
        this.metrics.set(jobName, current);
    }
    getMetrics(jobName) {
        return this.metrics.get(jobName);
    }
    getAllMetrics() {
        return new Map(this.metrics);
    }
    resetMetrics(jobName) {
        this.metrics.delete(jobName);
    }
    resetAllMetrics() {
        this.metrics.clear();
    }
}
// Singleton instance
exports.metricsCollector = new MetricsCollector();
//# sourceMappingURL=metrics.js.map