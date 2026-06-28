// ── Node v26 + undici workaround ────────────────────────────────────────────
// Node v26 changed Headers constructor to reject Symbol keys (sensitiveHeaders).
// undici 8.5.0 passes this symbol internally, causing a ByteString conversion error.
// @discordjs/rest uses undici.request() directly, so we patch it to strip symbols.
// This file is loaded via --import BEFORE the main module, guaranteeing execution order.

try {
  const undici = require("undici");
  const origRequest = undici.request;

  function cleanHeaders(headers) {
    if (!headers || typeof headers !== "object") return headers;
    if (headers instanceof Headers) {
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

  undici.request = async function (url, options) {
    if (options && options.headers) {
      options = { ...options, headers: cleanHeaders(options.headers) };
    }
    return origRequest(url, options);
  };

  console.log("[undici-patch] Patched undici.request to strip Symbol keys from headers");
} catch {
  // undici not available — skip patch
}
