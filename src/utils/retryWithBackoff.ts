/**
 * retryWithBackoff.ts — Shared retry utility with exponential backoff
 *
 * Replaces manual retry loops across services.
 * Supports max attempts, initial delay, max delay, and custom retry predicate.
 */

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

const defaultShouldRetry = (_error: unknown): boolean => true;

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 500,
    maxDelayMs = 10_000,
    factor = 2,
    jitter = true,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      if (onRetry) {
        onRetry(error, attempt);
      }

      let delay = Math.min(initialDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function isRetryableError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const code = (error as { code?: string }).code;
    if (!code) return true;
    const retryable = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "fetch failed",
    ];
    return retryable.some((r) => code === r || String(code).includes(r));
  }
  return true;
}
