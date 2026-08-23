/**
 * Retry utility — re-exports from async.ts for backward compatibility.
 * New code should import retryWithBackoff from async.ts directly.
 * @deprecated Use retryWithBackoff from async.ts instead.
 */

export { retryWithBackoff as retry } from "./async.js";

/**
 * Check if an error is retryable
 * @param error - Error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('ECONNREFUSED') || 
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ECONNRESET')) {
      return true;
    }
    
    // HTTP status codes
    if (typeof error === "object" && error !== null && "response" in error && (error as {response?: {status?: number}}).response?.status) {
      const status = (error as {response: {status: number}}).response.status;
      return status === 429 || status === 503 || status === 502 || status >= 500;
    }
  }
  
  return false;
}
