/**
 * processHandlers.ts — Gestionnaires d'erreurs process
 *
 * Extrait de index.ts pour réduire sa complexité.
 */

import * as Sentry from "@sentry/node";
import logger from "./utils/logger.js";
import { sendCrashAlert } from "./utils/crash-webhook.js";

export function attachProcessHandlers(): void {
  // Suppress ECONNREFUSED spam from node-redis/BullMQ socket layer (printed to stderr before handlers)
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: Buffer | string, ...args: unknown[]) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString();
    if (text.includes("ECONNREFUSED") && text.includes("6379")) {
      return true; // Pretend we wrote it — silently swallow
    }
    return origStderrWrite(chunk, ...(args as []));
  }) as typeof process.stderr.write;

  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const combined = args.map(String).join(" ");
    if (
      combined.includes("ECONNREFUSED") &&
      (combined.includes("6379") ||
        combined.includes("redis") ||
        combined.includes("AggregateError"))
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

  function isTransientSocketError(err: Error): boolean {
    const msg = String(err.message || err.name);
    return (
      msg.includes("other side closed") ||
      msg.includes("UND_ERR_SOCKET") ||
      msg.includes("ECONNRESET") ||
      msg.includes("EPIPE") ||
      msg.includes("socket hang up") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("client is destroyed") ||
      msg.includes("ClientDestroyedError")
    );
  }

  function isUndiciAssertionError(err: Error): boolean {
    const msg = String(err.message || "");
    const stack = String(err.stack || "");
    return (
      (msg.includes("false == true") && stack.includes("undici")) ||
      (err.name === "AssertionError" && stack.includes("undici")) ||
      stack.includes("Parser.finish") ||
      stack.includes("onHttpSocketEnd")
    );
  }

  process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    // Erreurs Redis non-fatals — ne pas crasher le bot
    if (isRedisError(err)) {
      logger.warn(`[PROCESS] Redis rejection (non-fatal): ${err.message || err.name}`);
      return;
    }
    if (isTransientSocketError(err)) {
      logger.warn(`[PROCESS] Transient socket rejection (non-fatal): ${err.message || err.name}`);
      return;
    }
    if (isUndiciAssertionError(err)) {
      logger.warn(`[PROCESS] Undici assertion (non-fatal, Node.js TLS bug): ${err.message}`);
      return;
    }
    logger.error(`[PROCESS] Unhandled Rejection at: ${promise}, reason: ${err.message}`, {
      stack: err.stack,
    });
    Sentry.captureException(err, { tags: { type: "unhandledRejection" } });
    // Crash webhook seulement (cooldown persistant 30min + skip en crash loop)
    void sendCrashAlert(
      "Unhandled Rejection",
      `${err.message}\n\nStack: ${err.stack?.slice(0, 3000)}`,
    );
    // PLUS de DM owner — le crash webhook suffit, évite le spam
  });

  process.on("uncaughtException", (error: Error) => {
    // Erreurs Redis non-fatales — ne pas crasher le bot
    if (isRedisError(error)) {
      logger.warn(`[PROCESS] Redis error (non-fatal): ${error.message || error.name}`);
      return;
    }
    if (isTransientSocketError(error)) {
      logger.warn(`[PROCESS] Transient socket error (non-fatal): ${error.message || error.name}`);
      return;
    }
    if (isUndiciAssertionError(error)) {
      logger.warn(`[PROCESS] Undici assertion (non-fatal, Node.js TLS bug): ${error.message}`);
      return;
    }
    logger.error(`[PROCESS] ⚠️ Uncaught Exception: ${error.message}`, { stack: error.stack });
    logger.error("[PROCESS] L'erreur a ete capturee. Le bot continue de fonctionner.");
    Sentry.captureException(error, { tags: { type: "uncaughtException" } });
    // Crash webhook seulement (cooldown persistant 30min + skip en crash loop)
    void sendCrashAlert(
      "Uncaught Exception",
      `${error.message}\n\nStack: ${error.stack?.slice(0, 3000)}`,
    );
    // PLUS de DM owner — le crash webhook suffit, évite le spam
  });
}
