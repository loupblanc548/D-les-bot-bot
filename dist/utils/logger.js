"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fortniteLogger = exports.Sentry = void 0;
const winston_1 = __importDefault(require("winston"));
const Sentry = __importStar(require("@sentry/node"));
exports.Sentry = Sentry;
// ─── Formats ─────────────────────────────────────────────────────
/** Format coloré et lisible pour la console uniquement */
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: "HH:mm:ss" }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 && meta.stack == null
        ? " " + JSON.stringify(meta)
        : "";
    return `${timestamp} ${level}: ${message}${metaStr}`;
}));
/** Format JSON structuré pour les fichiers de log */
const fileJsonFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
// ─── Logger principal ────────────────────────────────────────────
// Console : tout (info, warn, error). Le flood Fortnite est éliminé car
//   les modules Fortnite utilisent désormais `fortniteLogger` (fichier seul).
// Fichier : logs/combined.log (rotation 5×5 MB) — historique complet.
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || "info",
    transports: [
        new winston_1.default.transports.Console({ format: consoleFormat }),
        new winston_1.default.transports.File({
            filename: "logs/combined.log",
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
            format: fileJsonFormat,
        }),
    ],
});
// ─── Logger dédié Fortnite ───────────────────────────────────────
// Fichier seul (logs/fortnite.log, rotation 3×5 MB).
// AUCUNE sortie console pour info/warn → plus de flood jaune "⚠️ Entrée sans nom".
// Les erreurs critiques remontent quand même dans la console ET Sentry.
const fortniteLogger = winston_1.default.createLogger({
    level: "info",
    transports: [
        new winston_1.default.transports.File({
            filename: "logs/combined.log",
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
            format: fileJsonFormat,
        }),
        new winston_1.default.transports.File({
            filename: "logs/fortnite.log",
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3,
            format: fileJsonFormat,
        }),
        // Erreurs Fortnite → console (critique, ne doit pas être silencieuse)
        new winston_1.default.transports.Console({
            level: "error",
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: "HH:mm:ss" }), winston_1.default.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: [Fortnite] ${message}`)),
        }),
    ],
});
exports.fortniteLogger = fortniteLogger;
// ─── Sentry Bridge : logger.error() → Sentry.captureException() ──
function createSentryBridge(target, moduleName) {
    const originalError = target.error.bind(target);
    const errorProxy = function (message, ...rest) {
        const msg = typeof message === "string" ? message : String(message);
        const error = message instanceof Error
            ? message
            : rest.find((a) => a instanceof Error) ??
                new Error(msg);
        Sentry.captureException(error, {
            extra: {
                args: [message, ...rest],
                ...(moduleName ? { module: moduleName } : {}),
            },
        });
        // @ts-expect-error - winston's error signature accepts variadic args
        return originalError(message, ...rest);
    };
    target.error = errorProxy;
}
createSentryBridge(logger);
createSentryBridge(fortniteLogger, "fortnite");
exports.default = logger;
//# sourceMappingURL=logger.js.map