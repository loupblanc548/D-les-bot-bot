import winston from "winston";
import * as Sentry from "@sentry/node";

// ─── Formats ─────────────────────────────────────────────────────

/** Format coloré et lisible pour la console uniquement */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr =
      Object.keys(meta).length > 0 && meta.stack == null ? " " + JSON.stringify(meta) : "";
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

/** Format JSON structuré pour les fichiers de log */
const fileJsonFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ─── Logger principal ────────────────────────────────────────────
// Console : tout (info, warn, error). Le flood Fortnite est éliminé car
//   les modules Fortnite utilisent désormais `fortniteLogger` (fichier seul).
// Fichier : logs/combined.log (rotation 5×5 MB) — historique complet.
// En production (Docker/Railway), désactivation des fichiers pour éviter EACCES.

const isProduction = process.env.NODE_ENV === "production";
const logDir = isProduction ? "/tmp/logs" : "logs";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    ...(isProduction
      ? []
      : [
          new winston.transports.File({
            filename: `${logDir}/combined.log`,
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
            format: fileJsonFormat,
          }),
        ]),
  ],
});

// ─── Logger dédié Fortnite ───────────────────────────────────────
// Fichier seul (logs/fortnite.log, rotation 3×5 MB).
// AUCUNE sortie console pour info/warn → plus de flood jaune "⚠️ Entrée sans nom".
// Les erreurs critiques remontent quand même dans la console ET Sentry.
// En production, désactivation des fichiers pour éviter EACCES.

const fortniteLogger = winston.createLogger({
  level: "info",
  transports: [
    ...(isProduction
      ? []
      : [
          new winston.transports.File({
            filename: `${logDir}/combined.log`,
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
            format: fileJsonFormat,
          }),
          new winston.transports.File({
            filename: `${logDir}/fortnite.log`,
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3,
            format: fileJsonFormat,
          }),
        ]),
    // Erreurs Fortnite → console (critique, ne doit pas être silencieuse)
    new winston.transports.Console({
      level: "error",
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "HH:mm:ss" }),
        winston.format.printf(
          ({ timestamp, level, message }) => `${timestamp} ${level}: [Fortnite] ${message}`,
        ),
      ),
    }),
  ],
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
