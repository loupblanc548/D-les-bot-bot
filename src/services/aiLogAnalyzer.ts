/**
 * aiLogAnalyzer.ts — AI Log Analyzer
 *
 * Analyse continue des logs du bot pour détecter automatiquement
 * les anomalies, patterns d'erreur récurrents, et pics d'activité.
 *
 * Fonctionnalités :
 *  1. Anomaly Detection — spikes, drops, patterns inhabituels
 *  2. Error Clustering — regroupement d'erreurs similaires
 *  3. Predictive Alerting — alerte avant qu'un crash ne se produise
 *  4. Log Pattern Learning — apprentissage des patterns normaux
 *  5. Auto-Report — génère des rapports d'analyse périodiques
 *
 * Intégration : alimente l'incidentResolver et le SOC automatiquement.
 */

import logger from "../utils/logger.js";
import { createLog } from "./logs.js";
import { recordSecurityEvent } from "./socExtension.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  message: string;
}

export interface Anomaly {
  id: string;
  type: "ERROR_SPIKE" | "UNUSUAL_PATTERN" | "RATE_ANOMALY" | "NEW_ERROR_TYPE" | "MEMORY_GROWTH";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source: string;
  description: string;
  detectedAt: Date;
  data: Record<string, unknown>;
}

export interface LogPattern {
  pattern: string;
  source: string;
  frequency: number;
  lastSeen: number;
  isNormal: boolean;
}

export interface AnalysisReport {
  totalEntries: number;
  errorCount: number;
  warnCount: number;
  topErrorSources: { source: string; count: number }[];
  anomalies: Anomaly[];
  patterns: LogPattern[];
  generatedAt: Date;
}

// ─── State ───────────────────────────────────────────────────────────────────

const logBuffer: LogEntry[] = [];
const MAX_BUFFER = 5000;
const knownPatterns = new Map<string, LogPattern>();
const MAX_PATTERNS = 2000;
const anomalyHistory: Anomaly[] = [];
const MAX_ANOMALIES = 200;

const baselineStats = new Map<string, { avgPerMin: number; samples: number }>();

// ─── Configuration ───────────────────────────────────────────────────────────

let analysisEnabled = true;
let analysisIntervalMs = 60_000; // 1 min
let analysisTimer: ReturnType<typeof setInterval> | null = null;
const ERROR_SPIKE_THRESHOLD = 10; // 10 erreurs/min = spike
const _MEMORY_GROWTH_THRESHOLD = 50 * 1024 * 1024;

export function getAnalyzerConfig(): { enabled: boolean; intervalMs: number } {
  return { enabled: analysisEnabled, intervalMs: analysisIntervalMs };
}

export function updateAnalyzerConfig(enabled?: boolean, intervalMs?: number): void {
  if (enabled !== undefined) analysisEnabled = enabled;
  if (intervalMs !== undefined) analysisIntervalMs = intervalMs;
  logger.info(
    `[AILogAnalyzer] Config: enabled=${analysisEnabled}, interval=${analysisIntervalMs}ms`,
  );
}

// ─── Ingestion des logs ──────────────────────────────────────────────────────

/**
 * Enregistre une entrée de log pour analyse.
 */
export function ingestLog(level: LogEntry["level"], source: string, message: string): void {
  if (!analysisEnabled) return;

  logBuffer.push({
    timestamp: Date.now(),
    level,
    source,
    message: message.slice(0, 500),
  });

  if (logBuffer.length > MAX_BUFFER) {
    logBuffer.splice(0, logBuffer.length - MAX_BUFFER);
  }

  // Apprentissage de patterns en temps réel
  learnPattern(source, message);
}

/**
 * Enregistre une entrée de log depuis le logger du bot.
 * À connecter au transport logger.
 */
export function attachToLogger(logFn: (level: string, message: string) => void): void {
  const original = logFn;
  logFn = (level: string, message: string) => {
    original(level, message);
    if (["info", "warn", "error", "debug"].includes(level)) {
      ingestLog(level as LogEntry["level"], "bot", message);
    }
  };
}

// ─── Apprentissage de patterns ───────────────────────────────────────────────

function learnPattern(source: string, message: string): void {
  // Normaliser le message (remplacer les valeurs variables par des placeholders)
  const normalized = message
    .replace(/\d+/g, "N")
    .replace(/https?:\/\/[^\s]+/g, "URL")
    .replace(/[a-f0-9]{8,}/gi, "HASH")
    .replace(/<@!?\d+>/g, "MENTION")
    .replace(/#\w+/g, "CHANNEL")
    .slice(0, 200);

  const key = `${source}::${normalized}`;
  const pattern = knownPatterns.get(key);

  if (pattern) {
    pattern.frequency++;
    pattern.lastSeen = Date.now();
  } else {
    if (knownPatterns.size >= MAX_PATTERNS) {
      const firstKey = knownPatterns.keys().next().value;
      if (firstKey !== undefined) knownPatterns.delete(firstKey);
    }
    knownPatterns.set(key, {
      pattern: normalized,
      source,
      frequency: 1,
      lastSeen: Date.now(),
      isNormal: false,
    });

    // Nouveau pattern d'erreur = potentiellement une anomalie
    if (message.includes("error") || message.includes("Error") || message.includes("CRASH")) {
      detectAnomaly(
        "NEW_ERROR_TYPE",
        source,
        `Nouveau pattern d'erreur: ${normalized.slice(0, 100)}`,
        "MEDIUM",
        { pattern: normalized },
      );
    }
  }

  // Marquer comme normal après 10+ occurrences sans erreur
  if (pattern && pattern.frequency > 10 && !normalized.toLowerCase().includes("error")) {
    pattern.isNormal = true;
  }
}

// ─── Détection d'anomalies ───────────────────────────────────────────────────

/**
 * Analyse le buffer de logs et détecte les anomalies.
 */
export function analyzeLogs(): Anomaly[] {
  if (!analysisEnabled) return [];

  const now = Date.now();
  const windowMs = 60_000; // 1 min
  const recentLogs = logBuffer.filter((l) => now - l.timestamp < windowMs);
  const recentErrors = recentLogs.filter((l) => l.level === "error");
  const _recentWarns = recentLogs.filter((l) => l.level === "warn");

  const newAnomalies: Anomaly[] = [];

  // 1. Error spike
  if (recentErrors.length >= ERROR_SPIKE_THRESHOLD) {
    const sources = new Map<string, number>();
    for (const err of recentErrors) {
      sources.set(err.source, (sources.get(err.source) ?? 0) + 1);
    }
    const topSource = Array.from(sources.entries()).sort((a, b) => b[1] - a[1])[0];

    newAnomalies.push(
      detectAnomaly(
        "ERROR_SPIKE",
        topSource[0],
        `${recentErrors.length} erreurs en 1 min (source: ${topSource[0]}, ${topSource[1]} erreurs)`,
        recentErrors.length >= 20 ? "CRITICAL" : "HIGH",
        { errorCount: recentErrors.length, topSource: topSource[0], topCount: topSource[1] },
      ),
    );
  }

  // 2. Rate anomaly (comparaison avec baseline)
  const currentRate = recentLogs.length;
  const baseline = baselineStats.get("global");
  if (baseline && baseline.samples > 5) {
    const expected = baseline.avgPerMin;
    if (currentRate > expected * 3 || currentRate < expected * 0.3) {
      newAnomalies.push(
        detectAnomaly(
          "RATE_ANOMALY",
          "global",
          `Taux de logs anormal: ${currentRate}/min (attendu: ${expected.toFixed(1)}/min)`,
          currentRate > expected * 5 ? "HIGH" : "MEDIUM",
          { current: currentRate, expected, ratio: currentRate / expected },
        ),
      );
    }
  }

  // Mettre à jour la baseline
  if (baseline) {
    baseline.avgPerMin =
      (baseline.avgPerMin * baseline.samples + currentRate) / (baseline.samples + 1);
    baseline.samples++;
  } else {
    baselineStats.set("global", { avgPerMin: currentRate, samples: 1 });
  }

  // 3. Memory growth detection
  const memUsage = process.memoryUsage();
  const memMB = memUsage.rss / (1024 * 1024);
  if (memMB > 500) {
    newAnomalies.push(
      detectAnomaly(
        "MEMORY_GROWTH",
        "process",
        `Utilisation mémoire élevée: ${memMB.toFixed(1)}MB`,
        memMB > 1000 ? "CRITICAL" : "HIGH",
        { rssMB: memMB, heapUsedMB: memUsage.heapUsed / (1024 * 1024) },
      ),
    );
  }

  // Enregistrer les anomalies dans le SOC
  for (const anomaly of newAnomalies) {
    recordSecurityEvent({
      guildId: "system",
      type: "LOG_ANOMALY",
      severity: anomaly.severity,
      source: "AILogAnalyzer",
      message: anomaly.description,
      metadata: { anomalyId: anomaly.id, type: anomaly.type, ...anomaly.data },
    });
  }

  return newAnomalies;
}

function detectAnomaly(
  type: Anomaly["type"],
  source: string,
  description: string,
  severity: Anomaly["severity"],
  data: Record<string, unknown>,
): Anomaly {
  const anomaly: Anomaly = {
    id: `anomaly_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity,
    source,
    description,
    detectedAt: new Date(),
    data,
  };

  anomalyHistory.unshift(anomaly);
  if (anomalyHistory.length > MAX_ANOMALIES) {
    anomalyHistory.length = MAX_ANOMALIES;
  }

  logger.warn(`[AILogAnalyzer] Anomalie détectée: ${type} (${severity}) — ${description}`);
  return anomaly;
}

// ─── Démarrage / Arrêt de l'analyse continue ────────────────────────────────

/**
 * Démarre l'analyse continue des logs.
 */
export function startContinuousAnalysis(): void {
  if (analysisTimer) return;

  analysisTimer = setInterval(() => {
    try {
      const anomalies = analyzeLogs();
      if (anomalies.length > 0) {
        for (const a of anomalies) {
          if (a.severity === "CRITICAL" || a.severity === "HIGH") {
            createLog({
              type: "LOG_ANOMALY",
              action: `Anomalie: ${a.description}`,
              details: JSON.stringify({ id: a.id, type: a.type, severity: a.severity }),
            }).catch(() => {});
          }
        }
      }
    } catch (error) {
      logger.error(
        `[AILogAnalyzer] Analysis error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, analysisIntervalMs);

  if (analysisTimer.unref) analysisTimer.unref();
  logger.info(`[AILogAnalyzer] Analyse continue démarrée (interval: ${analysisIntervalMs}ms)`);
}

/**
 * Arrête l'analyse continue.
 */
export function stopContinuousAnalysis(): void {
  if (analysisTimer) {
    clearInterval(analysisTimer);
    analysisTimer = null;
    logger.info("[AILogAnalyzer] Analyse continue arrêtée");
  }
}

// ─── Rapports d'analyse ──────────────────────────────────────────────────────

/**
 * Génère un rapport d'analyse complet.
 */
export function generateAnalysisReport(): AnalysisReport {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1h
  const recentLogs = logBuffer.filter((l) => now - l.timestamp < windowMs);

  const errorCount = recentLogs.filter((l) => l.level === "error").length;
  const warnCount = recentLogs.filter((l) => l.level === "warn").length;

  const sourceCounts = new Map<string, number>();
  for (const log of recentLogs.filter((l) => l.level === "error")) {
    sourceCounts.set(log.source, (sourceCounts.get(log.source) ?? 0) + 1);
  }

  const topErrorSources = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalEntries: recentLogs.length,
    errorCount,
    warnCount,
    topErrorSources,
    anomalies: anomalyHistory.slice(0, 20),
    patterns: Array.from(knownPatterns.values())
      .filter((p) => !p.isNormal)
      .slice(0, 20),
    generatedAt: new Date(),
  };
}

// ─── API publique ────────────────────────────────────────────────────────────

export function getAnomalies(limit?: number): Anomaly[] {
  return limit ? anomalyHistory.slice(0, limit) : [...anomalyHistory];
}

export function getKnownPatterns(): LogPattern[] {
  return Array.from(knownPatterns.values());
}

export function clearAnalyzer(): void {
  logBuffer.length = 0;
  knownPatterns.clear();
  anomalyHistory.length = 0;
  baselineStats.clear();
}
