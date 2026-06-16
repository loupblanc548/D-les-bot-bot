/**
 * Retry utility for handling transient errors
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delayMs - Delay between retries in milliseconds (default: 1000)
 * @returns Promise with the result of the function
 */
export declare function retry<T>(fn: () => Promise<T>, maxRetries?: number, delayMs?: number): Promise<T>;
/**
 * Check if an error is retryable
 * @param error - Error to check
 * @returns True if the error is retryable
 */
export declare function isRetryableError(error: unknown): boolean;
//# sourceMappingURL=retry.d.ts.map