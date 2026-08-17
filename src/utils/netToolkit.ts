/**
 * netToolkit.ts — Outils réseau avancés supplémentaires
 *
 * - DNS lookup (A, AAAA, MX, TXT, CNAME, NS)
 * - Banner grabbing (TCP connect + read)
 * - HTTP methods enumeration (OPTIONS, PUT, DELETE, TRACE)
 * - Directory/path checker (common paths like /admin, /.env, /api)
 * - Tech stack detector (identify server technologies)
 * - CORS tester (check cross-origin config)
 * - Email validator (MX, SPF, DKIM, DMARC)
 * - JWT decoder (decode + analyze header/payload)
 * - URL expander (follow redirects to final destination)
 * - Security headers scorer (grade A+ to F)
 */

import * as dnsPromises from "dns/promises";
import { connect as netConnect, Socket } from "net";
import { request as httpsRequest } from "https";
import { request as httpRequest } from "http";

// ─── 1. DNS Lookup ───────────────────────────────────────────────────────────

export interface DnsResult {
  domain: string;
  records: { type: string; value: string }[];
  success: boolean;
  error?: string;
}

export async function dnsLookup(domain: string, types?: string[]): Promise<DnsResult> {
  const recordTypes = types ?? ["A", "AAAA", "MX", "TXT", "CNAME", "NS"];
  const records: { type: string; value: string }[] = [];

  for (const type of recordTypes) {
    try {
      const resolver = dnsPromises as unknown as Record<
        string,
        (hostname: string) => Promise<unknown>
      >;
      const fn = resolver[`resolve${type}`];
      if (!fn) continue;
      const result = await fn(domain);
      if (Array.isArray(result)) {
        for (const r of result) {
          records.push({ type, value: typeof r === "string" ? r : JSON.stringify(r) });
        }
      } else if (result) {
        records.push({ type, value: String(result) });
      }
    } catch {
      // Record type not found — normal
    }
  }

  return {
    domain,
    records,
    success: records.length > 0,
    error: records.length === 0 ? "Aucun enregistrement DNS trouvé" : undefined,
  };
}

// ─── 2. Banner Grabbing ──────────────────────────────────────────────────────

export interface BannerResult {
  ip: string;
  port: number;
  banner: string | null;
  success: boolean;
  error?: string;
}

export async function grabBanner(
  ip: string,
  port: number,
  timeoutMs = 5000,
): Promise<BannerResult> {
  return new Promise((resolve) => {
    const socket: Socket = netConnect({ host: ip, port, timeout: timeoutMs });
    let banner = "";

    socket.on("data", (data) => {
      banner += data.toString("utf-8").slice(0, 500);
      socket.destroy();
      resolve({ ip, port, banner: banner.trim() || null, success: true });
    });

    socket.on("connect", () => {
      // For some protocols, send a probe
      if (port === 80 || port === 8080) {
        socket.write("HEAD / HTTP/1.0\r\nHost: " + ip + "\r\n\r\n");
      } else if (port === 25 || port === 587) {
        socket.write("QUIT\r\n");
      } else if (port === 21) {
        socket.write("QUIT\r\n");
      } else if (port === 22) {
        // SSH sends banner automatically
      }
      // For other ports, just wait for data
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        ip,
        port,
        banner: banner.trim() || null,
        success: banner.length > 0,
        error: banner.length === 0 ? "Timeout — pas de réponse" : undefined,
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ ip, port, banner: null, success: false, error: err.message.slice(0, 200) });
    });
  });
}

// ─── 3. HTTP Methods Enumeration ─────────────────────────────────────────────

export interface HttpMethodsResult {
  url: string;
  allowedMethods: string[];
  testedMethods: string[];
  server: string | null;
  success: boolean;
  error?: string;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD", "TRACE"];

export async function checkHttpMethods(url: string): Promise<HttpMethodsResult> {
  const allowedMethods: string[] = [];
  const isHTTPS = url.startsWith("https://");
  const reqFn = isHTTPS ? httpsRequest : httpRequest;

  // First, try OPTIONS to get Allow header
  try {
    const optionsResult = await new Promise<Record<string, string> | null>((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const req = reqFn(
        url,
        { method: "OPTIONS", signal: controller.signal, rejectUnauthorized: false },
        (res) => {
          clearTimeout(timeout);
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
          }
          res.destroy();
          resolve(headers);
        },
      );
      req.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
      req.end();
    });

    if (optionsResult?.allow) {
      allowedMethods.push(...optionsResult.allow.split(",").map((m) => m.trim().toUpperCase()));
    }
  } catch {
    // OPTIONS not supported — try individual methods
  }

  // If no Allow header, test each method individually
  if (allowedMethods.length === 0) {
    for (const method of HTTP_METHODS) {
      try {
        const result = await new Promise<number | null>((resolve) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5_000);
          const req = reqFn(
            url,
            { method, signal: controller.signal, rejectUnauthorized: false },
            (res) => {
              clearTimeout(timeout);
              res.destroy();
              resolve(res.statusCode ?? null);
            },
          );
          req.on("error", () => {
            clearTimeout(timeout);
            resolve(null);
          });
          req.end();
        });

        // 405 = Method Not Allowed, 501 = Not Implemented
        if (result !== null && result !== 405 && result !== 501) {
          allowedMethods.push(method);
        }
      } catch {
        // Method not allowed
      }
    }
  }

  return {
    url,
    allowedMethods: [...new Set(allowedMethods)],
    testedMethods: HTTP_METHODS,
    server: null,
    success: true,
  };
}

// ─── 4. Directory/Path Checker ───────────────────────────────────────────────

export interface DirectoryCheckResult {
  baseUrl: string;
  foundPaths: { path: string; status: number; contentType: string }[];
  checkedPaths: number;
  durationMs: number;
}

const COMMON_PATHS = [
  "/admin",
  "/admin/",
  "/login",
  "/wp-admin",
  "/wp-login.php",
  "/.env",
  "/.git/config",
  "/.git/HEAD",
  "/robots.txt",
  "/sitemap.xml",
  "/api",
  "/api/v1",
  "/api/health",
  "/health",
  "/healthz",
  "/status",
  "/metrics",
  "/.well-known/security.txt",
  "/server-status",
  "/phpinfo.php",
  "/info.php",
  "/backup",
  "/backup.zip",
  "/db.sql",
  "/config.php",
  "/.htaccess",
  "/.htpasswd",
  "/debug",
  "/console",
  "/actuator",
  "/actuator/health",
  "/graphql",
  "/swagger.json",
  "/swagger-ui",
  "/api-docs",
  "/v1/users",
  "/.DS_Store",
];

export async function checkDirectories(
  baseUrl: string,
  paths?: string[],
  concurrency = 5,
): Promise<DirectoryCheckResult> {
  const pathsToCheck = paths ?? COMMON_PATHS;
  const startTime = Date.now();
  const foundPaths: { path: string; status: number; contentType: string }[] = [];
  const isHTTPS = baseUrl.startsWith("https://");
  const reqFn = isHTTPS ? httpsRequest : httpRequest;

  for (let i = 0; i < pathsToCheck.length; i += concurrency) {
    const batch = pathsToCheck.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (p) => {
        const url = `${baseUrl}${p}`;
        return new Promise<{ path: string; status: number; contentType: string } | null>(
          (resolve) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5_000);
            const req = reqFn(
              url,
              { method: "GET", signal: controller.signal, rejectUnauthorized: false },
              (res) => {
                clearTimeout(timeout);
                const ct = res.headers["content-type"] || "";
                res.destroy();
                // 200, 301, 302, 401, 403 = interesting
                if (res.statusCode && res.statusCode !== 404 && res.statusCode !== 400) {
                  resolve({ path: p, status: res.statusCode, contentType: String(ct) });
                } else {
                  resolve(null);
                }
              },
            );
            req.on("error", () => {
              clearTimeout(timeout);
              resolve(null);
            });
            req.end();
          },
        );
      }),
    );

    for (const r of results) {
      if (r) foundPaths.push(r);
    }
  }

  return {
    baseUrl,
    foundPaths: foundPaths.sort((a, b) => a.path.localeCompare(b.path)),
    checkedPaths: pathsToCheck.length,
    durationMs: Date.now() - startTime,
  };
}

// ─── 5. Tech Stack Detector ──────────────────────────────────────────────────

export interface TechDetectResult {
  url: string;
  technologies: { name: string; version?: string; evidence: string }[];
  server: string | null;
  poweredBy: string | null;
  success: boolean;
  error?: string;
}

export async function detectTech(url: string): Promise<TechDetectResult> {
  const isHTTPS = url.startsWith("https://");
  const reqFn = isHTTPS ? httpsRequest : httpRequest;
  const technologies: { name: string; version?: string; evidence: string }[] = [];

  try {
    const headers = await new Promise<Record<string, string> | null>((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const req = reqFn(url, { signal: controller.signal, rejectUnauthorized: false }, (res) => {
        clearTimeout(timeout);
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          h[k] = Array.isArray(v) ? v.join(", ") : String(v);
        }
        res.destroy();
        resolve(h);
      });
      req.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
      req.end();
    });

    if (!headers) {
      return {
        url,
        technologies: [],
        server: null,
        poweredBy: null,
        success: false,
        error: "Connexion échouée",
      };
    }

    const server = headers["server"] || null;
    const poweredBy = headers["x-powered-by"] || null;

    // Detect from Server header
    if (server) {
      if (/nginx/i.test(server))
        technologies.push({ name: "Nginx", evidence: `Server: ${server}` });
      if (/apache/i.test(server))
        technologies.push({ name: "Apache", evidence: `Server: ${server}` });
      if (/iis|microsoft/i.test(server))
        technologies.push({ name: "IIS", evidence: `Server: ${server}` });
      if (/cloudflare/i.test(server))
        technologies.push({ name: "Cloudflare", evidence: `Server: ${server}` });
      if (/express/i.test(server))
        technologies.push({ name: "Express.js", evidence: `Server: ${server}` });
      if (/kestrel/i.test(server))
        technologies.push({ name: "ASP.NET/Kestrel", evidence: `Server: ${server}` });
    }

    // Detect from X-Powered-By
    if (poweredBy) {
      if (/express/i.test(poweredBy))
        technologies.push({ name: "Express.js", evidence: `X-Powered-By: ${poweredBy}` });
      if (/php/i.test(poweredBy))
        technologies.push({ name: "PHP", evidence: `X-Powered-By: ${poweredBy}` });
      if (/asp/i.test(poweredBy))
        technologies.push({ name: "ASP.NET", evidence: `X-Powered-By: ${poweredBy}` });
      if (/next/i.test(poweredBy))
        technologies.push({ name: "Next.js", evidence: `X-Powered-By: ${poweredBy}` });
    }

    // Detect from other headers
    if (headers["x-aspnet-version"])
      technologies.push({ name: "ASP.NET", evidence: "X-AspNet-Version header" });
    if (headers["x-generator"])
      technologies.push({ name: "CMS", evidence: `X-Generator: ${headers["x-generator"]}` });
    if (headers["via"] && /varnish/i.test(headers["via"]))
      technologies.push({ name: "Varnish Cache", evidence: "Via header" });
    if (headers["x-served-by"] && /cache/i.test(headers["x-served-by"]))
      technologies.push({ name: "CDN Cache", evidence: "X-Served-By header" });
    if (headers["x-cache"]) technologies.push({ name: "CDN", evidence: "X-Cache header" });

    return {
      url,
      technologies: [...new Map(technologies.map((t) => [t.name, t])).values()],
      server,
      poweredBy,
      success: true,
    };
  } catch (err) {
    return {
      url,
      technologies: [],
      server: null,
      poweredBy: null,
      success: false,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }
}

// ─── 6. CORS Tester ──────────────────────────────────────────────────────────

export interface CorsTestResult {
  url: string;
  allowsOrigin: boolean;
  allowedOrigins: string;
  allowsCredentials: boolean;
  allowsMethods: string;
  allowsHeaders: string;
  exposedHeaders: string;
  maxAge: string | null;
  rating: "safe" | "permissive" | "dangerous";
  notes: string[];
  success: boolean;
  error?: string;
}

export async function testCors(url: string): Promise<CorsTestResult> {
  const isHTTPS = url.startsWith("https://");
  const reqFn = isHTTPS ? httpsRequest : httpRequest;
  const notes: string[] = [];

  try {
    const result = await new Promise<Record<string, string> | null>((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const req = reqFn(
        url,
        {
          method: "OPTIONS",
          signal: controller.signal,
          rejectUnauthorized: false,
          headers: {
            Origin: "https://evil.example.com",
            "Access-Control-Request-Method": "GET",
          },
        },
        (res) => {
          clearTimeout(timeout);
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            h[k] = Array.isArray(v) ? v.join(", ") : String(v);
          }
          res.destroy();
          resolve(h);
        },
      );
      req.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
      req.end();
    });

    if (!result) {
      return {
        url,
        allowsOrigin: false,
        allowedOrigins: "",
        allowsCredentials: false,
        allowsMethods: "",
        allowsHeaders: "",
        exposedHeaders: "",
        maxAge: null,
        rating: "safe",
        notes: ["Pas de réponse CORS"],
        success: false,
        error: "Connexion échouée",
      };
    }

    const aco = result["access-control-allow-origin"] || "";
    const acCreds = result["access-control-allow-credentials"] === "true";
    const acMethods = result["access-control-allow-methods"] || "";
    const acHeaders = result["access-control-allow-headers"] || "";
    const exposedHeaders = result["access-control-expose-headers"] || "";
    const maxAge = result["access-control-max-age"] || null;

    const allowsOrigin = !!aco;
    let rating: "safe" | "permissive" | "dangerous" = "safe";

    if (aco === "*") {
      rating = "permissive";
      notes.push("⚠️ CORS wildcard — n'importe quelle origine est acceptée");
    } else if (aco === "https://evil.example.com") {
      rating = "dangerous";
      notes.push("🚨 CORS reflète l'origine — vulnérable au vol de credentials");
    } else if (aco) {
      notes.push(`Origin autorisée: ${aco}`);
    }

    if (acCreds && rating !== "safe") {
      rating = "dangerous";
      notes.push("🚨 Credentials autorisés avec CORS permissif — risque critique");
    }

    if (acMethods.includes("*") || acMethods.includes("DELETE") || acMethods.includes("PUT")) {
      notes.push(`⚠️ Méthodes dangereuses autorisées: ${acMethods}`);
    }

    return {
      url,
      allowsOrigin,
      allowedOrigins: aco,
      allowsCredentials: acCreds,
      allowsMethods: acMethods,
      allowsHeaders: acHeaders,
      exposedHeaders,
      maxAge,
      rating,
      notes,
      success: true,
    };
  } catch (err) {
    return {
      url,
      allowsOrigin: false,
      allowedOrigins: "",
      allowsCredentials: false,
      allowsMethods: "",
      allowsHeaders: "",
      exposedHeaders: "",
      maxAge: null,
      rating: "safe",
      notes: [],
      success: false,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }
}

// ─── 7. Email Validator (MX, SPF, DKIM, DMARC) ───────────────────────────────

export interface EmailValidateResult {
  email: string;
  domain: string;
  hasMx: boolean;
  mxRecords: string[];
  hasSpf: boolean;
  spfRecord: string | null;
  hasDmarc: boolean;
  dmarcRecord: string | null;
  hasDkim: boolean;
  valid: boolean;
  notes: string[];
}

export async function validateEmail(email: string): Promise<EmailValidateResult> {
  const notes: string[] = [];
  const domain = email.split("@")[1] || "";

  if (!domain) {
    return {
      email,
      domain: "",
      hasMx: false,
      mxRecords: [],
      hasSpf: false,
      spfRecord: null,
      hasDmarc: false,
      dmarcRecord: null,
      hasDkim: false,
      valid: false,
      notes: ["Format d'email invalide — pas de domaine"],
    };
  }

  // MX records
  let mxRecords: string[] = [];
  try {
    const mx = await dnsPromises.resolveMx(domain);
    mxRecords = mx.map((r) => r.exchange);
  } catch {
    // No MX
  }

  // SPF (TXT record)
  let spfRecord: string | null = null;
  try {
    const txt = await dnsPromises.resolveTxt(domain);
    for (const record of txt) {
      const joined = Array.isArray(record) ? record.join("") : String(record);
      if (joined.includes("v=spf1")) {
        spfRecord = joined;
        break;
      }
    }
  } catch {
    // No TXT
  }

  // DMARC (_dmarc.domain TXT)
  let dmarcRecord: string | null = null;
  try {
    const dmarcTxt = await dnsPromises.resolveTxt(`_dmarc.${domain}`);
    for (const record of dmarcTxt) {
      const joined = Array.isArray(record) ? record.join("") : String(record);
      if (joined.includes("v=DMARC1")) {
        dmarcRecord = joined;
        break;
      }
    }
  } catch {
    // No DMARC
  }

  // DKIM (try default selector)
  let hasDkim = false;
  try {
    const dkimTxt = await dnsPromises.resolveTxt(`default._domainkey.${domain}`);
    hasDkim = dkimTxt.length > 0;
  } catch {
    // No DKIM with default selector
  }

  const hasMx = mxRecords.length > 0;
  const hasSpf = !!spfRecord;
  const hasDmarc = !!dmarcRecord;

  if (!hasMx) notes.push("⚠️ Aucun enregistrement MX — le domaine ne reçoit pas d'emails");
  if (!hasSpf) notes.push("⚠️ Pas de SPF — risque d'usurpation d'expéditeur");
  if (!hasDmarc) notes.push("⚠️ Pas de DMARC — pas de politique de rejet des emails spoofés");
  if (!hasDkim)
    notes.push(
      "ℹ️ DKIM non détecté (sélecteur par défaut) — la signature peut exister sous un autre sélecteur",
    );
  if (hasMx && hasSpf && hasDmarc) notes.push("✅ Configuration email complète (MX + SPF + DMARC)");

  return {
    email,
    domain,
    hasMx,
    mxRecords,
    hasSpf,
    spfRecord,
    hasDmarc,
    dmarcRecord,
    hasDkim,
    valid: hasMx,
    notes,
  };
}

// ─── 8. JWT Decoder ──────────────────────────────────────────────────────────

export interface JwtDecodeResult {
  valid: boolean;
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  signature: string | null;
  algorithm: string | null;
  expiresAt: string | null;
  issuedAt: string | null;
  issuer: string | null;
  audience: string | null;
  subject: string | null;
  isExpired: boolean;
  error?: string;
}

export function decodeJwt(token: string): JwtDecodeResult {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return {
        valid: false,
        header: null,
        payload: null,
        signature: null,
        algorithm: null,
        expiresAt: null,
        issuedAt: null,
        issuer: null,
        audience: null,
        subject: null,
        isExpired: false,
        error: "Format JWT invalide — doit avoir 3 parties séparées par des points",
      };
    }

    const decodeBase64 = (str: string): Record<string, unknown> => {
      const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
      const decoded = Buffer.from(padded, "base64url").toString("utf-8");
      return JSON.parse(decoded);
    };

    const header = decodeBase64(parts[0]);
    const payload = decodeBase64(parts[1]);
    const signature = parts[2];

    const algorithm = (header.alg as string) || null;
    const expiresAt = payload.exp ? new Date((payload.exp as number) * 1000).toISOString() : null;
    const issuedAt = payload.iat ? new Date((payload.iat as number) * 1000).toISOString() : null;
    const issuer = (payload.iss as string) || null;
    const audience = (payload.aud as string) || null;
    const subject = (payload.sub as string) || null;
    const isExpired = payload.exp ? (payload.exp as number) * 1000 < Date.now() : false;

    return {
      valid: true,
      header,
      payload,
      signature,
      algorithm,
      expiresAt,
      issuedAt,
      issuer,
      audience,
      subject,
      isExpired,
    };
  } catch (err) {
    return {
      valid: false,
      header: null,
      payload: null,
      signature: null,
      algorithm: null,
      expiresAt: null,
      issuedAt: null,
      issuer: null,
      audience: null,
      subject: null,
      isExpired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 9. URL Expander ─────────────────────────────────────────────────────────

export interface UrlExpandResult {
  originalUrl: string;
  finalUrl: string;
  redirects: { url: string; status: number }[];
  totalRedirects: number;
  success: boolean;
  error?: string;
}

export async function expandUrl(url: string, maxRedirects = 10): Promise<UrlExpandResult> {
  const redirects: { url: string; status: number }[] = [];
  let currentUrl = url;
  const isHTTPS = url.startsWith("https://");
  const reqFn = isHTTPS ? httpsRequest : httpRequest;

  for (let i = 0; i < maxRedirects; i++) {
    try {
      const result = await new Promise<{ location?: string; status: number }>((resolve) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const req = reqFn(
          currentUrl,
          { method: "HEAD", signal: controller.signal, rejectUnauthorized: false },
          (res) => {
            clearTimeout(timeout);
            resolve({
              location: res.headers.location as string | undefined,
              status: res.statusCode ?? 0,
            });
            res.destroy();
          },
        );
        req.on("error", () => {
          clearTimeout(timeout);
          resolve({ status: 0 });
        });
        req.end();
      });

      if (result.status >= 300 && result.status < 400 && result.location) {
        redirects.push({ url: currentUrl, status: result.status });
        // Handle relative redirects
        currentUrl = result.location.startsWith("http")
          ? result.location
          : new URL(result.location, currentUrl).href;
      } else {
        return {
          originalUrl: url,
          finalUrl: currentUrl,
          redirects,
          totalRedirects: redirects.length,
          success: true,
        };
      }
    } catch (err) {
      return {
        originalUrl: url,
        finalUrl: currentUrl,
        redirects,
        totalRedirects: redirects.length,
        success: false,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      };
    }
  }

  return {
    originalUrl: url,
    finalUrl: currentUrl,
    redirects,
    totalRedirects: redirects.length,
    success: false,
    error: `Trop de redirects (> ${maxRedirects})`,
  };
}

// ─── 10. Security Headers Scorer ─────────────────────────────────────────────

export interface SecurityScoreResult {
  url: string;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  score: number;
  headers: {
    name: string;
    present: boolean;
    value: string | null;
    points: number;
  }[];
  recommendations: string[];
  success: boolean;
  error?: string;
}

export async function scoreSecurityHeaders(url: string): Promise<SecurityScoreResult> {
  const isHTTPS = url.startsWith("https://");
  const reqFn = isHTTPS ? httpsRequest : httpRequest;

  try {
    const headers = await new Promise<Record<string, string> | null>((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const req = reqFn(url, { signal: controller.signal, rejectUnauthorized: false }, (res) => {
        clearTimeout(timeout);
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          h[k] = Array.isArray(v) ? v.join(", ") : String(v);
        }
        res.destroy();
        resolve(h);
      });
      req.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
      req.end();
    });

    if (!headers) {
      return {
        url,
        grade: "F",
        score: 0,
        headers: [],
        recommendations: ["Serveur inaccessible"],
        success: false,
        error: "Connexion échouée",
      };
    }

    const checks = [
      { name: "Strict-Transport-Security", key: "strict-transport-security", points: 20 },
      { name: "Content-Security-Policy", key: "content-security-policy", points: 25 },
      { name: "X-Frame-Options", key: "x-frame-options", points: 15 },
      { name: "X-Content-Type-Options", key: "x-content-type-options", points: 10 },
      { name: "Referrer-Policy", key: "referrer-policy", points: 10 },
      { name: "Permissions-Policy", key: "permissions-policy", points: 10 },
      { name: "X-XSS-Protection", key: "x-xss-protection", points: 5 },
      { name: "Cross-Origin-Opener-Policy", key: "cross-origin-opener-policy", points: 5 },
    ];

    const headerResults = checks.map((c) => ({
      name: c.name,
      present: !!headers[c.key],
      value: headers[c.key] || null,
      points: headers[c.key] ? c.points : 0,
    }));

    const score = headerResults.reduce((sum, h) => sum + h.points, 0);
    const grade: SecurityScoreResult["grade"] =
      score >= 90
        ? "A+"
        : score >= 75
          ? "A"
          : score >= 60
            ? "B"
            : score >= 40
              ? "C"
              : score >= 20
                ? "D"
                : "F";

    const recommendations: string[] = [];
    for (const h of headerResults) {
      if (!h.present) {
        recommendations.push(`Ajouter le header ${h.name}`);
      }
    }

    return {
      url,
      grade,
      score,
      headers: headerResults,
      recommendations,
      success: true,
    };
  } catch (err) {
    return {
      url,
      grade: "F",
      score: 0,
      headers: [],
      recommendations: [],
      success: false,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }
}
