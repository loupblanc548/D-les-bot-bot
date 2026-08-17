/**
 * globalFetchGuard.ts — Monkey-patch global fetch() with SSRF protection
 *
 * This ensures ALL fetch() calls in the codebase go through SSRF validation,
 * even in files that don't explicitly import safeFetch().
 *
 * Files that already use safeFetch() from ssrfGuard.ts are unaffected
 * (they call the original fetch internally with redirect: "manual").
 */

import { checkUrlForSsrf } from "./ssrfGuard.js";

let originalFetch: typeof globalThis.fetch | null = null;
let guardInstalled = false;

export function installGlobalFetchGuard(): void {
  if (guardInstalled) return;

  originalFetch = globalThis.fetch;
  guardInstalled = true;

  const guardedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string;

    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input instanceof Request) {
      url = input.url;
    } else {
      url = String(input);
    }

    // Skip SSRF check for non-http(s) protocols (data:, blob:, etc.)
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return originalFetch!(input, init);
    }

    // Skip SSRF check for localhost (internal API calls)
    const parsed = new URL(url);
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1"
    ) {
      return originalFetch!(input, init);
    }

    // Skip if already using manual redirect (safeFetch is calling us)
    if (init?.redirect === "manual") {
      return originalFetch!(input, init);
    }

    const check = await checkUrlForSsrf(url, "global-fetch-guard");
    if (!check.allowed) {
      throw new Error(`SSRF blocked by global guard: ${check.reason}`);
    }

    return originalFetch!(input, init);
  };

  globalThis.fetch = guardedFetch as typeof globalThis.fetch;
}

export function uninstallGlobalFetchGuard(): void {
  if (!guardInstalled || !originalFetch) return;
  globalThis.fetch = originalFetch;
  guardInstalled = false;
  originalFetch = null;
}
