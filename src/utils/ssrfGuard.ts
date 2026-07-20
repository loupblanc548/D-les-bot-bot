/**
 * ssrfGuard.ts — Protection contre les attaques SSRF (Server-Side Request Forgery)
 *
 * Vérifie qu'une URL ne pointe pas vers une adresse privée/locale avant d'effectuer
 * une requête HTTP. Bloque: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 * 169.254.0.0/16 (link-local / AWS metadata), ::1, fc00::/7.
 *
 * Gère aussi: redirections HTTP vers IP privée, notations IP alternatives
 * (décimal, octal, hexadécimal).
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
];

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const int = ipToInt(ip);
  return PRIVATE_RANGES_IPV4.some((r) => int >= r.start && int <= r.end);
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — extract the IPv4 part and check
    const v4 = lower.slice(7);
    if (isIP(v4) === 4) return isPrivateIPv4(v4);
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
  // Si c'est déjà une IP valide
  const family = isIP(input);
  if (family === 4 || family === 6) return input;

  // Tentative de parsing décimal/hex (notation alternative d'IPv4)
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
 */
export async function checkUrlForSsrf(url: string, context?: string): Promise<SsrfCheckResult> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // Vérifier si le hostname est directement une IP (avec notations alternatives)
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

    // Résolution DNS
    let addresses: string[];
    try {
      const result = await lookup(hostname, { all: true });
      addresses = result.map((r) => r.address);
    } catch {
      // Si la résolution échoue, on laisse passer — le fetch échouera naturellement
      return { allowed: true, reason: "DNS lookup failed, allowing fetch to fail naturally" };
    }

    if (addresses.length === 0) {
      return { allowed: true, reason: "No DNS records, allowing fetch to fail naturally" };
    }

    // Vérifier toutes les IPs résolues
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

  // Désactiver le suivi automatique des redirections pour les vérifier manuellement
  const fetchOptions: RequestInit = {
    ...options,
    redirect: "manual",
  };

  let currentUrl = url;
  let response = await fetch(currentUrl, fetchOptions);

  // Suivre les redirections manuellement (max 3)
  for (let i = 0; i < 3; i++) {
    if (response.status < 300 || response.status >= 400) break;

    const location = response.headers.get("location");
    if (!location) break;

    // Résoudre l'URL de redirection (peut être relative)
    currentUrl = new URL(location, currentUrl).href;

    // Re-vérifier la destination
    const redirectCheck = await checkUrlForSsrf(currentUrl, `${context} → redirect`);
    if (!redirectCheck.allowed) {
      throw new Error(`SSRF blocked on redirect: ${redirectCheck.reason}`);
    }

    response = await fetch(currentUrl, fetchOptions);
  }

  return response;
}
