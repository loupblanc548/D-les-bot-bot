// ── Node v26 + undici workaround ────────────────────────────────────────────
// Node v26 changed Headers constructor to reject Symbol keys (sensitiveHeaders).
// undici 8.5.0 passes this symbol internally, causing a ByteString conversion error.
// @discordjs/rest uses undici.request() directly, so we patch it to strip symbols.
// This file MUST be imported first — before discord.js or anything that loads undici.

import { createRequire } from "module";

const _require = createRequire(import.meta.url);

try {
  const undici = _require("undici");
  const origRequest = undici.request;

  function cleanHeaders(headers: any): any {
    if (!headers || typeof headers !== "object") return headers;
    if (headers instanceof Headers) {
      const clean: Record<string, string> = {};
      headers.forEach((value: string, key: string) => { clean[key] = value; });
      return clean;
    }
    if (Array.isArray(headers)) return headers;
    const clean: Record<string, string> = {};
    for (const key of Object.keys(headers)) {
      const val = headers[key];
      if (typeof val === "string") clean[key] = val;
      else if (Array.isArray(val)) clean[key] = val.join(", ");
      else if (val !== undefined && val !== null) clean[key] = String(val);
    }
    return clean;
  }

  undici.request = (async (url: any, options?: any) => {
    if (options && options.headers) {
      options = { ...options, headers: cleanHeaders(options.headers) };
    }
    return origRequest(url, options);
  }) as typeof undici.request;

  console.log("[undici-patch] Patched undici.request to strip Symbol keys from headers");
} catch {
  // undici not available — skip patch
}
