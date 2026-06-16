"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retry = retry;
exports.isRetryableError = isRetryableError;
/**
 * Retry utility for handling transient errors
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delayMs - Delay between retries in milliseconds (default: 1000)
 * @returns Promise with the result of the function
 */
async function retry(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxRetries) {
                throw error;
            }
            // Exponential backoff
            const backoffDelay = delayMs * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
    }
    throw lastError;
}
/**
 * Check if an error is retryable
 * @param error - Error to check
 * @returns True if the error is retryable
 */
function isRetryableError(error) {
    if (error instanceof Error) {
        // Network errors
        if (error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('ECONNRESET')) {
            return true;
        }
        // HTTP status codes
        if (typeof error === "object" && error !== null && "response" in error && error.response?.status) {
            const status = error.response.status;
            return status === 429 || status === 503 || status === 502 || status >= 500;
        }
    }
    return false;
}
//# sourceMappingURL=retry.js.map