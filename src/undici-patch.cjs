// ── Node v26 + undici workaround ────────────────────────────────────────────
// Node v26 changed Headers constructor to reject Symbol keys (sensitiveHeaders).
// undici 8.5.0 passes this symbol internally, causing a ByteString conversion error.
// @discordjs/rest uses global fetch() which goes through undici's Headers constructor.
// We patch: (1) the global Headers constructor, (2) undici.request, (3) global fetch.
// Idempotent: safe to load via --require AND ESM import without double-wrapping.

if (!globalThis.__undiciPatched) {
  globalThis.__undiciPatched = true;

  function cleanHeaders(headers) {
    if (!headers || typeof headers !== "object") return headers;
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      const clean = {};
      headers.forEach((value, key) => { clean[key] = value; });
      return clean;
    }
    if (Array.isArray(headers)) return headers;
    const clean = {};
    for (const key of Object.keys(headers)) {
      const val = headers[key];
      if (typeof val === "string") clean[key] = val;
      else if (Array.isArray(val)) clean[key] = val.join(", ");
      else if (val !== undefined && val !== null) clean[key] = String(val);
    }
    return clean;
  }

  // 1) Patch the global Headers constructor to strip Symbol keys from init object
  try {
    const OrigHeaders = globalThis.Headers;
    if (OrigHeaders) {
      class PatchedHeaders extends OrigHeaders {
        constructor(init) {
          if (init && typeof init === "object" && !Array.isArray(init)) {
            const cleaned = {};
            for (const key of Object.keys(init)) {
              cleaned[key] = init[key];
            }
            super(cleaned);
            return;
          }
          super(init);
        }
      }
      globalThis.Headers = PatchedHeaders;
    }
  } catch {
    // Headers not available — skip
  }

  // 2) Patch undici.request to strip Symbol keys from headers
  try {
    const undici = require("undici");
    const origRequest = undici.request;

    undici.request = async function (url, options) {
      if (options && options.headers) {
        options = { ...options, headers: cleanHeaders(options.headers) };
      }
      return origRequest(url, options);
    };

    // 3) Patch undici.fetch if it exists
    if (undici.fetch) {
      const origFetch = undici.fetch;
      undici.fetch = async function (input, init) {
        if (init && init.headers) {
          init = { ...init, headers: cleanHeaders(init.headers) };
        }
        return origFetch(input, init);
      };
    }
  } catch {
    // undici not available — skip
  }

  // 4) Patch global fetch to strip Symbol keys from headers
  try {
    const origGlobalFetch = globalThis.fetch;
    if (origGlobalFetch) {
      globalThis.fetch = async function (input, init) {
        if (init && init.headers) {
          init = { ...init, headers: cleanHeaders(init.headers) };
        }
        return origGlobalFetch(input, init);
      };
    }
  } catch {
    // global fetch not available — skip
  }

  console.log("[undici-patch] Patched Headers constructor, undici.request, undici.fetch, and global fetch");
}
