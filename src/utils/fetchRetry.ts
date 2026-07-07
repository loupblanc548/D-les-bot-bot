/**
 * fetchRetry.ts — Fetch with automatic retry for transient network errors
 *
 * Handles "other side closed", TLS socket errors, ECONNRESET, ETIMEDOUT, etc.
 * These are common with HTTP/2 connections in Node.js (undici).
 */

import logger from "./logger.js";

const RETRYABLE_ERRORS = [
  "other side closed",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "fetch failed",
  "UND_ERR_SOCKET",
  "socket hang up",
  "network error",
];

function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return RETRYABLE_ERRORS.some((e) => msg.toLowerCase().includes(e.toLowerCase()));
}

interface FetchRetryOptions extends RequestInit {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

/**
 * Fetch with automatic retry for transient network errors.
 * Uses AbortSignal.timeout for per-attempt timeout.
 *
 * @param url URL to fetch
 * @param options Fetch options + retry config
 * @returns Response object
 */
export async function fetchRetry(
  url: string,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const {
    retries = 2,
    retryDelayMs = 1000,
    timeoutMs = 10_000,
    signal: externalSignal,
    ...fetchOptions
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Combine external signal with timeout
      const signals: AbortSignal[] = [];
      if (externalSignal) signals.push(externalSignal);
      signals.push(AbortSignal.timeout(timeoutMs));

      const combinedSignal = signals.length > 1
        ? AbortSignal.any(signals)
        : signals[0];

      const res = await fetch(url, {
        ...fetchOptions,
        signal: combinedSignal,
      });
      return res;
    } catch (error) {
      lastError = error;

      // Don't retry on manual abort (not timeout)
      if (externalSignal?.aborted) throw error;

      // Don't retry on the last attempt
      if (attempt >= retries) break;

      // Only retry transient errors
      if (!isRetryableError(error)) break;

      const delay = retryDelayMs * Math.pow(1.5, attempt); // exponential backoff
      logger.debug(
        `[FetchRetry] Attempt ${attempt + 1}/${retries + 1} failed for ${url.slice(0, 80)}: ` +
        `${error instanceof Error ? error.message : String(error)} — retrying in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/**
 * Fetch text with retry. Returns null if all attempts fail.
 */
export async function fetchTextRetry(
  url: string,
  options?: FetchRetryOptions,
): Promise<string | null> {
  try {
    const res = await fetchRetry(url, options);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Fetch JSON with retry. Returns null if all attempts fail.
 */
export async function fetchJsonRetry<T = unknown>(
  url: string,
  options?: FetchRetryOptions,
): Promise<T | null> {
  try {
    const res = await fetchRetry(url, options);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
