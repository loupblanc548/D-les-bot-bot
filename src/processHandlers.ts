/**
 * processHandlers.ts — Gestionnaires d'erreurs process
 *
 * Extrait de index.ts pour réduire sa complexité.
 */

import * as Sentry from "@sentry/node";
import logger from "./utils/logger.js";
import { sendCrashAlert } from "./utils/crash-webhook.js";
import { sendProactiveAlert } from "./services/proactiveAlerts.js";

export function attachProcessHandlers(): void {
  // Suppress ECONNREFUSED spam from node-redis socket layer (printed to stderr before handlers)
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const combined = args.map(String).join(" ");
    if (
      combined.includes("ECONNREFUSED") &&
      (combined.includes("6379") || combined.includes("redis") || combined.includes("AggregateError"))
    ) {
      return; // Silent — Redis is optional, fallback to local cache
    }
    origConsoleError(...args);
  };

  function isRedisError(err: Error): boolean {
    const msg = String(err.message);
    const code = (err as any).code;
    return (
      msg.includes("ECONNREFUSED") ||
      msg.includes("Redis") ||
      code === "ECONNREFUSED" ||
      (err as any).errors?.some?.((e: Error) => isRedisError(e))
    );
  }

  process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    // Erreurs Redis non-fatals — ne pas crasher le bot
    if (isRedisError(err)) {
      logger.warn(`[PROCESS] Redis rejection (non-fatal): ${err.message || err.name}`);
      return;
    }
    logger.error(`[PROCESS] Unhandled Rejection at: ${promise}, reason: ${err.message}`, {
      stack: err.stack,
    });
    Sentry.captureException(err, { tags: { type: "unhandledRejection" } });
    void sendCrashAlert(
      "Unhandled Rejection",
      `${err.message}\n\nStack: ${err.stack?.slice(0, 3000)}`,
    );
    void sendProactiveAlert(
      "unhandled_rejection",
      "🔴 Unhandled Rejection",
      `**Erreur:** ${err.message}\n\`\`\`${err.stack?.slice(0, 800) || "N/A"}\`\`\``,
      0xff3344,
      60 * 1000,
    );
  });

  process.on("uncaughtException", (error: Error) => {
    // Erreurs Redis non-fatals — ne pas crasher le bot
    if (isRedisError(error)) {
      logger.warn(`[PROCESS] Redis error (non-fatal): ${error.message || error.name}`);
      return;
    }
    logger.error(`[PROCESS] ⚠️ Uncaught Exception: ${error.message}`, { stack: error.stack });
    logger.error("[PROCESS] L'erreur a ete capturee. Le bot continue de fonctionner.");
    Sentry.captureException(error, { tags: { type: "uncaughtException" } });
    void sendCrashAlert(
      "Uncaught Exception",
      `${error.message}\n\nStack: ${error.stack?.slice(0, 3000)}`,
    );
    void sendProactiveAlert(
      "uncaught_exception",
      "🔴 Uncaught Exception",
      `**Erreur:** ${error.message}\n\`\`\`${error.stack?.slice(0, 800) || "N/A"}\`\`\``,
      0xff3344,
      60 * 1000,
    );
  });
}
