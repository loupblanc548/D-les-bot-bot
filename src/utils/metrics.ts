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

class MetricsCollector {
  private metrics: Map<string, Metrics> = new Map();
  private timeSeriesHistory: Map<string, TimeSeriesSnapshot[]> = new Map();
  private readonly MAX_SNAPSHOTS_PER_JOB = 180; // 3h of per-minute data (reduced from 1440)

  recordProcessing(jobName: string, success: boolean, processingTimeMs: number): void {
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
    } else {
      current.totalErrors++;
    }
    current.lastProcessed = new Date();
    current.averageProcessingTime = 
      (current.averageProcessingTime * (current.totalProcessed - 1) + processingTimeMs) / current.totalProcessed;

    this.metrics.set(jobName, current);
  }

  recordSnapshot(jobName: string): void {
    const current = this.metrics.get(jobName);
    if (!current) return;

    if (!this.timeSeriesHistory.has(jobName)) {
      this.timeSeriesHistory.set(jobName, []);
    }

    const history = this.timeSeriesHistory.get(jobName)!;
    
    const snapshot: TimeSeriesSnapshot = {
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

  getMetricsForPeriod(
    jobName: string,
    periodMs: number,
    periodLabel: string
  ): AggregatedPeriodMetrics | null {
    const history = this.timeSeriesHistory.get(jobName);
    if (!history || history.length === 0) return null;

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
      averageProcessingTime: snapshotsInPeriod.reduce((sum, s) => 
        sum + s.averageProcessingTime, 0
      ) / snapshotsInPeriod.length,
      throughputPerMinute: Math.round(throughputPerMinute * 100) / 100,
    };
  }

  getMetricsForStandardPeriods(jobName: string): {
    "1h": AggregatedPeriodMetrics | null;
    "6h": AggregatedPeriodMetrics | null;
    "24h": AggregatedPeriodMetrics | null;
  } {
    return {
      "1h": this.getMetricsForPeriod(jobName, 60 * 60 * 1000, "1h"),
      "6h": this.getMetricsForPeriod(jobName, 6 * 60 * 60 * 1000, "6h"),
      "24h": this.getMetricsForPeriod(jobName, 24 * 60 * 60 * 1000, "24h"),
    };
  }

  getAggregatedSummaryForPeriod(
    periodMs: number,
    periodLabel: string
  ): AggregatedPeriodMetrics | null {
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

    if (avgTimeCount === 0) return null;

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

  getMetrics(jobName: string): Metrics | undefined {
    return this.metrics.get(jobName);
  }

  getAllMetrics(): Map<string, Metrics> {
    return new Map(this.metrics);
  }

  getTimeSeriesHistory(jobName: string): TimeSeriesSnapshot[] {
    return [...(this.timeSeriesHistory.get(jobName) || [])];
  }

  resetMetrics(jobName: string): void {
    this.metrics.delete(jobName);
    this.timeSeriesHistory.delete(jobName);
  }

  resetAllMetrics(): void {
    this.metrics.clear();
    this.timeSeriesHistory.clear();
  }
}

export const metricsCollector = new MetricsCollector();
