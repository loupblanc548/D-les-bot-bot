/**
 * ssrfGuard.ts — Protection contre les attaques SSRF (Server-Side Request Forgery)
 *
 * Vérifie qu'une URL ne pointe pas vers une adresse privée/locale avant d'effectuer
 * une requête HTTP. Bloque: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 * 169.254.0.0/16 (link-local / AWS metadata), 100.64.0.0/10 (CGNAT), TEST-NET,
 * ::1, fc00::/7.
 *
 * Fail-closed: DNS lookup failure, empty records, and non-http(s) schemes are blocked.
 * Also handles: HTTP redirects to private IPs, alternate IP notations (decimal/octal/hex).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import logger from "./logger.js";

const PRIVATE_RANGES_IPV4: Array<{ start: number; end: number }> = [
  { start: ipToInt("127.0.0.0"), end: ipToInt("127.255.255.255") }, // 127.0.0.0/8
  { start: ipToInt("10.0.0.0"), end: ipToInt("10.255.255.255") }, // 10.0.0.0/8
  { start: ipToInt("172.16.0.0"), end: ipToInt("172.31.255.255") }, // 172.16.0.0/12
  { start: ipToInt("192.168.0.0"), end: ipToInt("192.168.255.255") }, // 192.168.0.0/16
  { start: ipToInt("169.254.0.0"), end: ipToInt("169.254.255.255") }, // 169.254.0.0/16
  { start: ipToInt("0.0.0.0"), end: ipToInt("0.255.255.255") }, // 0.0.0.0/8
  { start: ipToInt("100.64.0.0"), end: ipToInt("100.127.255.255") }, // 100.64.0.0/10 CGNAT
  { start: ipToInt("192.0.0.0"), end: ipToInt("192.0.0.255") }, // IETF protocol assignments
  { start: ipToInt("192.0.2.0"), end: ipToInt("192.0.2.255") }, // TEST-NET-1
  { start: ipToInt("198.18.0.0"), end: ipToInt("198.19.255.255") }, // benchmarking
  { start: ipToInt("198.51.100.0"), end: ipToInt("198.51.100.255") }, // TEST-NET-2
  { start: ipToInt("203.0.113.0"), end: ipToInt("203.0.113.255") }, // TEST-NET-3
  { start: ipToInt("224.0.0.0"), end: ipToInt("255.255.255.255") }, // multicast + reserved
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.google.com",
  "metadata",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const int = ipToInt(ip);
  return PRIVATE_RANGES_IPV4.some((r) => int >= r.start && int <= r.end);
}

function mappedIpv4FromV6(lower: string): string | null {
  if (!lower.startsWith("::ffff:")) return null;
  const rest = lower.slice(7);
  if (isIP(rest) === 4) return rest;
  // Hex form ::ffff:7f00:1
  const hexParts = rest.split(":");
  if (hexParts.length === 2 && hexParts[0].length <= 4 && hexParts[1].length <= 4) {
    const padded0 = hexParts[0].padStart(4, "0");
    const padded1 = hexParts[1].padStart(4, "0");
    const a = parseInt(padded0.slice(0, 2), 16);
    const b = parseInt(padded0.slice(2, 4), 16);
    const c = parseInt(padded1.slice(0, 2), 16);
    const d = parseInt(padded1.slice(2, 4), 16);
    if ([a, b, c, d].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return `${a}.${b}.${c}.${d}`;
    }
  }
  return null;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("2001:db8:")) return true; // documentation
  const mapped = mappedIpv4FromV6(lower);
  if (mapped) return isPrivateIPv4(mapped);
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) {
    return true;
  }
  return false;
}

/**
 * Normalise une entrée IP — gère les notations alternatives:
 * - Décimal: 2130706433 → 127.0.0.1
 * - Octal: 0177.0.0.1 → 127.0.0.1
 * - Hexadécimal: 0x7f.0.0.1 → 127.0.0.1
 */
function normalizeIPInput(input: string): string | null {
  const family = isIP(input);
  if (family === 4 || family === 6) return input;

  const asNum = Number(input);
  if (!isNaN(asNum) && asNum >= 0 && asNum <= 0xffffffff) {
    const a = (asNum >>> 24) & 0xff;
    const b = (asNum >>> 16) & 0xff;
    const c = (asNum >>> 8) & 0xff;
    const d = asNum & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }

  return null;
}

export interface SsrfCheckResult {
  allowed: boolean;
  reason: string;
  resolvedIp?: string;
}

/**
 * Vérifie qu'une URL ne pointe pas vers une adresse privée/locale.
 * Résout le DNS et vérifie toutes les IPs retournées.
 * Fail-closed: DNS failures and non-http(s) schemes are blocked.
 */
export async function checkUrlForSsrf(url: string, context?: string): Promise<SsrfCheckResult> {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.toLowerCase();
    if (scheme !== "http:" && scheme !== "https:") {
      logger.warn(
        `[SSRF] Blocked non-http(s) scheme: ${scheme}${context ? ` (ctx: ${context})` : ""}`,
      );
      return { allowed: false, reason: `Blocked scheme: ${scheme}` };
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    if (isBlockedHostname(hostname)) {
      logger.warn(`[SSRF] Blocked hostname: ${hostname}${context ? ` (ctx: ${context})` : ""}`);
      return { allowed: false, reason: `Blocked hostname: ${hostname}` };
    }

    const normalizedIp = normalizeIPInput(hostname);
    if (normalizedIp) {
      const family = isIP(normalizedIp);
      const isPrivate =
        family === 4
          ? isPrivateIPv4(normalizedIp)
          : family === 6
            ? isPrivateIPv6(normalizedIp)
            : true;

      if (isPrivate) {
        logger.warn(
          `[SSRF] Blocked direct IP access to private address: ${hostname} → ${normalizedIp}${context ? ` (ctx: ${context})` : ""}`,
        );
        return {
          allowed: false,
          reason: `Blocked private/local IP: ${hostname}`,
          resolvedIp: normalizedIp,
        };
      }

      return { allowed: true, reason: "OK", resolvedIp: normalizedIp };
    }

    let addresses: string[];
    try {
      const result = await lookup(hostname, { all: true });
      addresses = result.map((r) => r.address);
    } catch {
      logger.warn(
        `[SSRF] Blocked unresolved hostname: ${hostname}${context ? ` (ctx: ${context})` : ""}`,
      );
      return { allowed: false, reason: `DNS lookup failed for ${hostname}` };
    }

    if (addresses.length === 0) {
      return { allowed: false, reason: `No DNS records for ${hostname}` };
    }

    for (const addr of addresses) {
      const family = isIP(addr);
      const isPrivate =
        family === 4 ? isPrivateIPv4(addr) : family === 6 ? isPrivateIPv6(addr) : true;

      if (isPrivate) {
        logger.warn(
          `[SSRF] Blocked DNS resolution to private address: ${hostname} → ${addr}${context ? ` (ctx: ${context})` : ""}`,
        );
        return {
          allowed: false,
          reason: `Blocked: ${hostname} resolves to private IP ${addr}`,
          resolvedIp: addr,
        };
      }
    }

    return { allowed: true, reason: "OK", resolvedIp: addresses[0] };
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }
}

/**
 * Wrapper sécurisé pour fetch() avec protection SSRF.
 * - Vérifie l'URL avant le fetch
 * - Suit les redirections manuellement (max 3) en re-vérifiant chaque destination
 * - Bloque les redirections vers des IPs privées
 */
export async function safeFetch(
  url: string,
  options?: RequestInit,
  context?: string,
): Promise<Response> {
  const check = await checkUrlForSsrf(url, context);
  if (!check.allowed) {
    throw new Error(`SSRF blocked: ${check.reason}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    redirect: "manual",
  };

  let currentUrl = url;
  let response = await fetch(currentUrl, fetchOptions);

  for (let i = 0; i < 3; i++) {
    if (response.status < 300 || response.status >= 400) break;

    const location = response.headers.get("location");
    if (!location) break;

    currentUrl = new URL(location, currentUrl).href;

    const redirectCheck = await checkUrlForSsrf(currentUrl, `${context} → redirect`);
    if (!redirectCheck.allowed) {
      throw new Error(`SSRF blocked on redirect: ${redirectCheck.reason}`);
    }

    response = await fetch(currentUrl, fetchOptions);
  }

  return response;
}
