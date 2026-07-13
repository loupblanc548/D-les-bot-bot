import winston from "winston";
import * as Sentry from "@sentry/node";

// ─── Formats ─────────────────────────────────────────────────────

/** Format coloré et lisible pour la console uniquement */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, _service, _environment, ...meta }) => {
    const metaStr =
      Object.keys(meta).length > 0 && meta.stack == null ? " " + JSON.stringify(meta) : "";
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

/** Format JSON structuré pour les fichiers de log et production */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ─── Logger principal ────────────────────────────────────────────
// Console : tout (info, warn, error). Le flood Fortnite est éliminé car
//   les modules Fortnite utilisent désormais `fortniteLogger` (fichier seul).
// Fichier : logs/combined.log (rotation 50MB, 14 jours de rétention).
// En production (Docker/Railway), JSON logging activé pour stdout/stderr.

const isProduction = process.env.NODE_ENV === "production";
const logDir = isProduction ? "/tmp/logs" : "logs";

// ─── MODULE 7: Rotating Log Management ───────────────────────────
// Max file size: 50MB, retention: 14 days, streamed (not buffered in memory).
const MAX_LOG_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_LOG_FILES = 14; // 14 days retention (one file per day max at 50MB)
const MAX_FORTNITE_LOG_FILES = 7; // 7 days for fortnite-specific logs

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: isProduction ? jsonFormat : consoleFormat,
  transports: [
    new winston.transports.Console({
      format: isProduction ? jsonFormat : consoleFormat,
    }),
    ...(isProduction
      ? []
      : [
          new winston.transports.File({
            filename: `${logDir}/combined.log`,
            maxsize: MAX_LOG_SIZE,
            maxFiles: MAX_LOG_FILES,
            tailable: true, // Stream mode — don't buffer in memory
            format: jsonFormat,
          }),
          new winston.transports.File({
            filename: `${logDir}/error.log`,
            level: "error",
            maxsize: MAX_LOG_SIZE,
            maxFiles: MAX_LOG_FILES,
            tailable: true,
            format: jsonFormat,
          }),
        ]),
  ],
  defaultMeta: {
    service: "discord-surveillance-bot",
    environment: process.env.NODE_ENV || "development",
  },
});

// ─── Logger dédié Fortnite ───────────────────────────────────────
// Fichier seul (logs/fortnite.log, rotation 3×5 MB).
// AUCUNE sortie console pour info/warn → plus de flood jaune "⚠️ Entrée sans nom".
// Les erreurs critiques remontent quand même dans la console ET Sentry.
// En production, JSON logging activé.

const fortniteLogger = winston.createLogger({
  level: "info",
  format: isProduction ? jsonFormat : consoleFormat,
  transports: [
    ...(isProduction
      ? []
      : [
          new winston.transports.File({
            filename: `${logDir}/combined.log`,
            maxsize: MAX_LOG_SIZE,
            maxFiles: MAX_LOG_FILES,
            tailable: true,
            format: jsonFormat,
          }),
          new winston.transports.File({
            filename: `${logDir}/fortnite.log`,
            maxsize: MAX_LOG_SIZE,
            maxFiles: MAX_FORTNITE_LOG_FILES,
            tailable: true,
            format: jsonFormat,
          }),
        ]),
    // Erreurs Fortnite → console (critique, ne doit pas être silencieuse)
    new winston.transports.Console({
      level: "error",
      format: isProduction
        ? jsonFormat
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: "HH:mm:ss" }),
            winston.format.printf(
              ({ timestamp, level, message }) => `${timestamp} ${level}: [Fortnite] ${message}`,
            ),
          ),
    }),
  ],
  defaultMeta: {
    service: "discord-surveillance-bot",
    module: "fortnite",
    environment: process.env.NODE_ENV || "development",
  },
});

// ─── Sentry Bridge : logger.error() → Sentry.captureException() ──
function createSentryBridge(target: winston.Logger, moduleName?: string): void {
  const originalError = target.error.bind(target);
  const errorProxy = function (message: string | Error, ...rest: unknown[]): winston.Logger {
    const msg = typeof message === "string" ? message : String(message);
    const error =
      message instanceof Error
        ? message
        : (rest.find((a): a is Error => a instanceof Error) ?? new Error(msg));
    Sentry.captureException(error, {
      extra: {
        args: [message, ...rest],
        ...(moduleName ? { module: moduleName } : {}),
      },
    });
    // @ts-expect-error - winston's error signature accepts variadic args
    return originalError(message, ...rest);
  };
  (target as any).error = errorProxy;
}

createSentryBridge(logger);
createSentryBridge(fortniteLogger, "fortnite");

export { Sentry, fortniteLogger };
export default logger;
