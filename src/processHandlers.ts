/**
 * processHandlers.ts — Gestionnaires d'erreurs process
 *
 * Extrait de index.ts pour réduire sa complexité.
 */

import * as Sentry from "@sentry/node";
import logger from "./utils/logger.js";
import { sendCrashAlert } from "./utils/crash-webhook.js";

export function attachProcessHandlers(): void {
  process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(`[PROCESS] Unhandled Rejection at: ${promise}, reason: ${err.message}`, {
      stack: err.stack,
    });
    Sentry.captureException(err, { tags: { type: "unhandledRejection" } });
    void sendCrashAlert(
      "Unhandled Rejection",
      `${err.message}\n\nStack: ${err.stack?.slice(0, 3000)}`,
    );
  });

  process.on("uncaughtException", (error: Error) => {
    logger.error(`[PROCESS] ⚠️ Uncaught Exception: ${error.message}`, { stack: error.stack });
    logger.error("[PROCESS] L'erreur a ete capturee. Le bot continue de fonctionner.");
    Sentry.captureException(error, { tags: { type: "uncaughtException" } });
    void sendCrashAlert(
      "Uncaught Exception",
      `${error.message}\n\nStack: ${error.stack?.slice(0, 3000)}`,
    );
  });
}
