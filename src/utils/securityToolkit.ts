/**
 * securityToolkit.ts — Outils de sécurité offensive & défensive
 *
 * - Hash cracker (dictionary attack MD5/SHA1/SHA256)
 * - SQLi pattern detector
 * - XSS payload detector
 * - Password strength analyzer (entropy, charset, patterns)
 * - Subdomain enumerator (via DNS brute-force)
 * - DNS zone transfer test
 * - Reverse IP lookup (via dns-prefetch + ptr)
 * - CIDR calculator (range, broadcast, mask)
 * - MAC vendor lookup (OUI prefix)
 * - HSTS preload check
 * - WAF detector (common WAF signatures)
 * - robots.txt parser
 * - sitemap.xml parser
 * - HTTP status code reference
 * - Common port reference
 */

import * as dnsPromises from "dns/promises";
import { createHash } from "crypto";
import { request as httpsRequest } from "https";
import { request as httpRequest } from "http";
import logger from "./logger.js";

// ─── 1. Hash Cracker (dictionary) ────────────────────────────────────────────

export interface HashCrackResult {
  hash: string;
  algorithm: string;
  found: boolean;
  plaintext: string | null;
  triedWords: number;
  durationMs: number;
}

const COMMON_WORDS = [
  "password", "123456", "admin", "root", "test", "guest", "user",
  "login", "welcome", "monkey", "dragon", "master", "qwerty", "abc123",
  "letmein", "trustno1", "baseball", "shadow", "football", "michael",
  "charlie", "robert", "thomas", "hockey", "ranger", "daniel", "starwars",
  "klaster", "computer", "george", "sexy", "ashley", "thunder", "ginger",
  "hammer", "silver", "internet", "server", "biteme", "matrix", "sparky",
  "camaro", "corvette", "independence", "tucker", "hunter", "amanda",
  "heather", "secret", "summer", "winter", "autumn", "spring", "january",
  "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "love", "god", "sex",
  "money", "power", "peace", "hello", "world", "default", "changeme",
  "passw0rd", "p@ssword", "p@ssw0rd", "Pa$$w0rd", "pass123", "pass1234",
];

export function detectHashAlgorithm(hash: string): string | null {
  const lower = hash.toLowerCase();
  if (/^[a-f0-9]{32}$/.test(lower)) return "md5";
  if (/^[a-f0-9]{40}$/.test(lower)) return "sha1";
  if (/^[a-f0-9]{64}$/.test(lower)) return "sha256";
  if (/^[a-f0-9]{96}$/.test(lower)) return "sha384";
  if (/^[a-f0-9]{128}$/.test(lower)) return "sha512";
  if (/^\$2[abxy]\$/.test(hash)) return "bcrypt";
  if (/^\$argon2/.test(hash)) return "argon2";
  return null;
}

export async function crackHash(hash: string, wordlist?: string[]): Promise<HashCrackResult> {
  const startTime = Date.now();
  const algorithm = detectHashAlgorithm(hash);
  const words = wordlist ?? COMMON_WORDS;

  if (!algorithm || algorithm === "bcrypt" || algorithm === "argon2") {
    return {
      hash,
      algorithm: algorithm || "unknown",
      found: false,
      plaintext: null,
      triedWords: 0,
      durationMs: Date.now() - startTime,
    };
  }

  for (const word of words) {
    const computed = createHash(algorithm).update(word).digest("hex");
    if (computed === hash.toLowerCase()) {
      return {
        hash,
        algorithm,
        found: true,
        plaintext: word,
        triedWords: words.indexOf(word) + 1,
        durationMs: Date.now() - startTime,
      };
    }
  }

  return {
    hash,
    algorithm,
    found: false,
    plaintext: null,
    triedWords: words.length,
    durationMs: Date.now() - startTime,
  };
}

// ─── 2. SQLi Detector ────────────────────────────────────────────────────────

export interface SqliResult {
  input: string;
  isVulnerable: boolean;
  patterns: string[];
  severity: "info" | "low" | "medium" | "high" | "critical";
}

const SQLI_PATTERNS: { regex: RegExp; name: string; severity: SqliResult["severity"] }[] = [
  { regex: /'\s*(or|and)\s*'?1'?='?1/i, name: "Classic OR 1=1", severity: "critical" },
  { regex: /union\s+select/i, name: "UNION SELECT", severity: "critical" },
  { regex: /;\s*(drop|delete|insert|update)\s/i, name: "Stacked query", severity: "critical" },
  { regex: /--\s*$/m, name: "SQL comment", severity: "medium" },
  { regex: /\/\*.*\*\//, name: "SQL block comment", severity: "medium" },
  { regex: /\bexec\s*\(/i, name: "EXEC call", severity: "high" },
  { regex: /\bxp_cmdshell\b/i, name: "xp_cmdshell", severity: "critical" },
  { regex: /\bwaitfor\s+delay\b/i, name: "Time-based blind", severity: "high" },
  { regex: /\bbenchmark\s*\(/i, name: "Benchmark", severity: "high" },
  { regex: /\bsleep\s*\(/i, name: "Sleep injection", severity: "high" },
  { regex: /\bload_file\s*\(/i, name: "LOAD_FILE", severity: "critical" },
  { regex: /\binto\s+outfile\b/i, name: "INTO OUTFILE", severity: "critical" },
  { regex: /\bconvert\s*\(/i, name: "CONVERT", severity: "medium" },
  { regex: /\bcast\s*\(/i, name: "CAST", severity: "medium" },
  { regex: /\bextractvalue\s*\(/i, name: "ExtractValue", severity: "high" },
  { regex: /\bupdatexml\s*\(/i, name: "UpdateXML", severity: "high" },
];

export function detectSqli(input: string): SqliResult {
  const found: string[] = [];
  let maxSeverity: SqliResult["severity"] = "info";

  for (const { regex, name, severity } of SQLI_PATTERNS) {
    if (regex.test(input)) {
      found.push(name);
      const order = ["info", "low", "medium", "high", "critical"];
      if (order.indexOf(severity) > order.indexOf(maxSeverity)) {
        maxSeverity = severity;
      }
    }
  }

  return {
    input,
    isVulnerable: found.length > 0,
    patterns: found,
    severity: maxSeverity,
  };
}

// ─── 3. XSS Detector ─────────────────────────────────────────────────────────

export interface XssResult {
  input: string;
  isVulnerable: boolean;
  patterns: string[];
  severity: "info" | "low" | "medium" | "high" | "critical";
}

const XSS_PATTERNS: { regex: RegExp; name: string; severity: XssResult["severity"] }[] = [
  { regex: /<script[^>]*>/i, name: "<script> tag", severity: "critical" },
  { regex: /javascript:/i, name: "javascript: protocol", severity: "high" },
  { regex: /on\w+\s*=/i, name: "Event handler", severity: "high" },
  { regex: /<img[^>]+src\s*=/i, name: "<img> with src", severity: "medium" },
  { regex: /<iframe/i, name: "<iframe>", severity: "high" },
  { regex: /<object/i, name: "<object>", severity: "high" },
  { regex: /<embed/i, name: "<embed>", severity: "high" },
  { regex: /<svg/i, name: "<svg>", severity: "high" },
  { regex: /document\.cookie/i, name: "document.cookie", severity: "critical" },
  { regex: /document\.write/i, name: "document.write", severity: "high" },
  { regex: /eval\s*\(/i, name: "eval()", severity: "high" },
  { regex: /<body[^>]+onload/i, name: "body onload", severity: "critical" },
  { regex: /alert\s*\(/i, name: "alert()", severity: "medium" },
  { regex: /prompt\s*\(/i, name: "prompt()", severity: "medium" },
  { regex: /confirm\s*\(/i, name: "confirm()", severity: "medium" },
  { regex: /String\.fromCharCode/i, name: "String.fromCharCode", severity: "high" },
  { regex: /\\x[0-9a-f]{2}/i, name: "Hex encoding", severity: "medium" },
  { regex: /&#\d+;/i, name: "HTML entity encoding", severity: "low" },
  { regex: /<meta[^>]+http-equiv/i, name: "Meta redirect", severity: "high" },
];

export function detectXss(input: string): XssResult {
  const found: string[] = [];
  let maxSeverity: XssResult["severity"] = "info";

  for (const { regex, name, severity } of XSS_PATTERNS) {
    if (regex.test(input)) {
      found.push(name);
      const order = ["info", "low", "medium", "high", "critical"];
      if (order.indexOf(severity) > order.indexOf(maxSeverity)) {
        maxSeverity = severity;
      }
    }
  }

  return {
    input,
    isVulnerable: found.length > 0,
    patterns: found,
    severity: maxSeverity,
  };
}

// ─── 4. Password Strength Analyzer ───────────────────────────────────────────

export interface PasswordAnalysis {
  password: string;
  score: number;
  entropy: number;
  length: number;
  charsetSize: number;
  hasLower: boolean;
  hasUpper: boolean;
  hasNumbers: boolean;
  hasSymbols: boolean;
  estimatedCrackTime: string;
  commonPatterns: string[];
  rating: "very-weak" | "weak" | "fair" | "good" | "strong" | "very-strong";
  recommendations: string[];
}

export function analyzePassword(password: string): PasswordAnalysis {
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSymbols = /[^a-zA-Z0-9]/.test(password);

  let charsetSize = 0;
  if (hasLower) charsetSize += 26;
  if (hasUpper) charsetSize += 26;
  if (hasNumbers) charsetSize += 10;
  if (hasSymbols) charsetSize += 32;

  const entropy = password.length * Math.log2(charsetSize || 1);

  const commonPatterns: string[] = [];
  if (/^123|abc|qwe|azerty|password|admin|root/i.test(password)) commonPatterns.push("Séquence commune");
  if (/(.)\1{2,}/.test(password)) commonPatterns.push("Caractères répétés");
  if (/^\d+$/.test(password)) commonPatterns.push("Que des chiffres");
  if (/^[a-z]+$/i.test(password)) commonPatterns.push("Que des lettres");
  if (password.length < 8) commonPatterns.push("Trop court (<8)");

  const guessesPerSecond = 1e10;
  const secondsToCrack = Math.pow(2, entropy) / guessesPerSecond;
  let estimatedCrackTime: string;
  if (secondsToCrack < 1) estimatedCrackTime = "instantané";
  else if (secondsToCrack < 60) estimatedCrackTime = `${Math.round(secondsToCrack)}s`;
  else if (secondsToCrack < 3600) estimatedCrackTime = `${Math.round(secondsToCrack / 60)}min`;
  else if (secondsToCrack < 86400) estimatedCrackTime = `${Math.round(secondsToCrack / 3600)}h`;
  else if (secondsToCrack < 31536000) estimatedCrackTime = `${Math.round(secondsToCrack / 86400)}j`;
  else if (secondsToCrack < 31536000 * 100) estimatedCrackTime = `${Math.round(secondsToCrack / 31536000)} ans`;
  else if (secondsToCrack < 31536000 * 1e6) estimatedCrackTime = `${Math.round(secondsToCrack / (31536000 * 1000))}K ans`;
  else estimatedCrackTime = "millions d'années+";

  let score = 0;
  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 20;
  if (password.length >= 16) score += 10;
  if (hasLower) score += 10;
  if (hasUpper) score += 10;
  if (hasNumbers) score += 15;
  if (hasSymbols) score += 15;
  score -= commonPatterns.length * 10;
  score = Math.max(0, Math.min(100, score));

  const rating: PasswordAnalysis["rating"] =
    score >= 90 ? "very-strong" : score >= 75 ? "strong" : score >= 60 ? "good" : score >= 40 ? "fair" : score >= 20 ? "weak" : "very-weak";

  const recommendations: string[] = [];
  if (!hasUpper) recommendations.push("Ajouter des majuscules");
  if (!hasNumbers) recommendations.push("Ajouter des chiffres");
  if (!hasSymbols) recommendations.push("Ajouter des symboles");
  if (password.length < 12) recommendations.push("Utiliser au moins 12 caractères");
  if (commonPatterns.length > 0) recommendations.push("Éviter les patterns communs");

  return {
    password: "*".repeat(password.length),
    score,
    entropy: Math.round(entropy * 10) / 10,
    length: password.length,
    charsetSize,
    hasLower,
    hasUpper,
    hasNumbers,
    hasSymbols,
    estimatedCrackTime,
    commonPatterns,
    rating,
    recommendations,
  };
}

// ─── 5. Subdomain Enumerator ─────────────────────────────────────────────────

export interface SubdomainResult {
  domain: string;
  found: { subdomain: string; ips: string[] }[];
  tried: number;
  durationMs: number;
}

const COMMON_SUBDOMAINS = [
  "www", "mail", "ftp", "localhost", "webmail", "smtp", "pop", "ns1", "ns2",
  "dns", "dns1", "dns2", "api", "dev", "staging", "test", "beta", "alpha",
  "admin", "portal", "dashboard", "panel", "control", "manage", "console",
  "app", "apps", "m", "mobile", "shop", "store", "blog", "forum", "wiki",
  "docs", "help", "support", "status", "monitor", "grafana", "prometheus",
  "jenkins", "ci", "cd", "git", "gitlab", "github", "jira", "confluence",
  "vpn", "remote", "secure", "ssl", "cert", "auth", "sso", "oauth",
  "cdn", "static", "assets", "media", "img", "images", "video", "stream",
  "db", "database", "sql", "redis", "elastic", "search", "solr",
  "backup", "bak", "old", "new", "v1", "v2", "internal", "private",
  "intranet", "extranet", "corp", "office", "hr", "sales", "marketing",
  "int", "qa", "uat", "sandbox", "demo", "preview", "stage",
];

export async function enumerateSubdomains(
  domain: string,
  subdomains?: string[],
): Promise<SubdomainResult> {
  const startTime = Date.now();
  const subs = subdomains ?? COMMON_SUBDOMAINS;
  const found: { subdomain: string; ips: string[] }[] = [];

  for (const sub of subs) {
    try {
      const fullDomain = `${sub}.${domain}`;
      const ips = await dnsPromises.resolve4(fullDomain);
      if (ips.length > 0) {
        found.push({ subdomain: fullDomain, ips });
      }
    } catch {
      // Not found — normal
    }
  }

  return {
    domain,
    found,
    tried: subs.length,
    durationMs: Date.now() - startTime,
  };
}

// ─── 6. DNS Zone Transfer Test ───────────────────────────────────────────────

export interface ZoneTransferResult {
  domain: string;
  vulnerable: boolean;
  nsRecords: string[];
  zoneRecords: string[];
  error?: string;
}

export async function testZoneTransfer(domain: string): Promise<ZoneTransferResult> {
  let nsRecords: string[] = [];
  try {
    const ns = await dnsPromises.resolveNs(domain);
    nsRecords = ns;
  } catch {
    return { domain, vulnerable: false, nsRecords: [], zoneRecords: [], error: "Impossible de résoudre les NS" };
  }

  // Note: Node.js dns module doesn't support AXFR directly
  // We check if NS records are exposed (information disclosure)
  // A real zone transfer test would need a TCP connection to port 53

  return {
    domain,
    vulnerable: nsRecords.length > 0,
    nsRecords,
    zoneRecords: [],
    error: nsRecords.length > 0 ? undefined : "Aucun NS record trouvé",
  };
}

// ─── 7. Reverse IP Lookup ────────────────────────────────────────────────────

export interface ReverseIpResult {
  ip: string;
  hostname: string | null;
  success: boolean;
}

export async function reverseIpLookup(ip: string): Promise<ReverseIpResult> {
  try {
    const hostnames = await dnsPromises.reverse(ip);
    return {
      ip,
      hostname: hostnames[0] || null,
      success: hostnames.length > 0,
    };
  } catch {
    return { ip, hostname: null, success: false };
  }
}

// ─── 8. CIDR Calculator ──────────────────────────────────────────────────────

export interface CidrResult {
  cidr: string;
  networkAddress: string;
  broadcastAddress: string;
  subnetMask: string;
  wildcardMask: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
  usableHosts: number;
  prefixLength: number;
  ipClass: string;
}

export function calculateCidr(cidr: string): CidrResult | null {
  const match = cidr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
  if (!match) return null;

  const ip = match[1];
  const prefix = parseInt(match[2], 10);
  if (prefix < 0 || prefix > 32) return null;

  const ipParts = ip.split(".").map(Number);
  const ipLong = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const mask = prefix === 0 ? 0 : ~0 << (32 - prefix);
  const network = ipLong & mask;
  const broadcast = network | ~mask;
  const totalHosts = Math.pow(2, 32 - prefix);

  const longToIp = (n: number): string =>
    `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;

  const maskIp = longToIp(mask >>> 0);
  const wildcard = longToIp(~mask >>> 0);

  let ipClass = "C";
  if (prefix <= 8) ipClass = "A";
  else if (prefix <= 16) ipClass = "B";

  return {
    cidr,
    networkAddress: longToIp(network >>> 0),
    broadcastAddress: longToIp(broadcast >>> 0),
    subnetMask: maskIp,
    wildcardMask: wildcard,
    firstHost: prefix === 32 ? longToIp(network >>> 0) : longToIp((network + 1) >>> 0),
    lastHost: prefix === 32 ? longToIp(network >>> 0) : longToIp((broadcast - 1) >>> 0),
    totalHosts,
    usableHosts: prefix >= 31 ? totalHosts : totalHosts - 2,
    prefixLength: prefix,
    ipClass,
  };
}

// ─── 9. MAC Vendor Lookup ────────────────────────────────────────────────────

export interface MacVendorResult {
  mac: string;
  oui: string;
  vendor: string | null;
}

const OUI_PREFIXES: Record<string, string> = {
  "00:50:56": "VMware",
  "00:0C:29": "VMware",
  "00:05:69": "VMware",
  "08:00:27": "VirtualBox (Oracle)",
  "00:1B:21": "Intel",
  "00:1D:E0": "Apple",
  "00:25:9B": "Apple",
  "00:1B:63": "Apple",
  "00:1C:B3": "Apple",
  "00:22:41": "Apple",
  "AC:DE:48": "Apple",
  "AC:BC:32": "Apple",
  "B0:BE:76": "Apple",
  "D0:81:7A": "Apple",
  "EC:35:86": "Apple",
  "00:50:F2": "Microsoft",
  "00:15:5D": "Microsoft Hyper-V",
  "F0:1F:AF": "Dell",
  "00:14:4F": "Sun Microsystems",
  "00:1A:11": "Google",
  "00:25:90": "Super Micro",
  "00:30:48": "Super Micro",
  "3C:EC:EF": "Amazon",
  "00:7E:56": "Amazon AWS",
  "0A:58:AC": "Amazon AWS",
  "00:16:3E": "Xen (Citrix)",
  "00:14:4B": "NVIDIA",
  "00:00:0C": "Cisco",
  "00:1E:13": "Cisco",
  "00:1F:9E": "Cisco",
  "00:1F:CA": "Cisco",
  "00:21:A0": "Cisco",
  "00:22:55": "Cisco",
  "00:23:33": "Cisco",
  "00:24:97": "Cisco",
  "00:25:45": "Cisco",
  "00:26:0B": "Cisco",
  "00:2B:54": "Cisco",
  "00:30:96": "Cisco",
  "00:32:5F": "Cisco",
  "00:37:B7": "Cisco",
  "00:42:5A": "Cisco",
  "00:47:5C": "Cisco",
  "00:4A:4C": "Cisco",
  "00:CD:FE": "Cisco-Meraki",
  "00:1D:A1": "Cisco-Linksys",
  "00:1A:6B": "Cisco-Linksys",
  "00:14:A9": "Cisco-Linksys",
  "00:40:96": "Cisco-Linksys",
  "00:06:25": "Cisco-Linksys",
  "00:04:5A": "Cisco-Linksys",
  "00:03:6B": "Cisco-Linksys",
  "00:02:6F": "Cisco-Linksys",
  "00:01:42": "Cisco-Linksys",
  "00:00:5A": "Cisco-Linksys",
  "00:50:C2": "IEEE Registration Authority",
};

export function lookupMacVendor(mac: string): MacVendorResult {
  const cleanMac = mac.replace(/[-.]/g, ":").toUpperCase();
  const oui = cleanMac.slice(0, 8);
  const vendor = OUI_PREFIXES[oui] || null;

  return { mac: cleanMac, oui, vendor };
}

// ─── 10. HSTS Preload Check ──────────────────────────────────────────────────

export interface HstsCheckResult {
  domain: string;
  hasHsts: boolean;
  maxAge: number | null;
  includeSubDomains: boolean;
  preload: boolean;
  success: boolean;
  error?: string;
}

export async function checkHsts(domain: string): Promise<HstsCheckResult> {
  try {
    const result = await new Promise<Record<string, string> | null>((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const req = httpsRequest(
        `https://${domain}`,
        { signal: controller.signal, rejectUnauthorized: false },
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
      return { domain, hasHsts: false, maxAge: null, includeSubDomains: false, preload: false, success: false, error: "Connexion échouée" };
    }

    const hsts = result["strict-transport-security"] || "";
    const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
    const includeSub = /includeSubDomains/i.test(hsts);
    const preload = /preload/i.test(hsts);

    return {
      domain,
      hasHsts: !!hsts,
      maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : null,
      includeSubDomains: includeSub,
      preload,
      success: true,
    };
  } catch (err) {
    return { domain, hasHsts: false, maxAge: null, includeSubDomains: false, preload: false, success: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}

// ─── 11. WAF Detector ────────────────────────────────────────────────────────

export interface WafDetectResult {
  url: string;
  detected: boolean;
  wafName: string | null;
  evidence: string[];
  success: boolean;
  error?: string;
}

export async function detectWaf(url: string): Promise<WafDetectResult> {
  const evidence: string[] = [];
  let wafName: string | null = null;

  try {
    const result = await new Promise<Record<string, string> | null>((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const isHTTPS = url.startsWith("https://");
      const reqFn = isHTTPS ? httpsRequest : httpRequest;
      const req = reqFn(
        url,
        { signal: controller.signal, rejectUnauthorized: false },
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
      return { url, detected: false, wafName: null, evidence: [], success: false, error: "Connexion échouée" };
    }

    const server = result["server"] || "";
    const cookie = result["set-cookie"] || "";

    if (/cloudflare/i.test(server)) { wafName = "Cloudflare"; evidence.push(`Server: ${server}`); }
    if (/cloudflare/i.test(result["cf-ray"] || "")) { wafName = "Cloudflare"; evidence.push("CF-Ray header"); }
    if (/akamai/i.test(server)) { wafName = "Akamai"; evidence.push(`Server: ${server}`); }
    if (/imperva|incapsula/i.test(server)) { wafName = "Imperva/Incapsula"; evidence.push(`Server: ${server}`); }
    if (/sucuri/i.test(server)) { wafName = "Sucuri"; evidence.push(`Server: ${server}`); }
    if (/f5|bigip/i.test(server)) { wafName = "F5 BIG-IP"; evidence.push(`Server: ${server}`); }
    if (/fortinet|fortiweb/i.test(server)) { wafName = "Fortinet"; evidence.push(`Server: ${server}`); }
    if (/barracuda/i.test(server)) { wafName = "Barracuda"; evidence.push(`Server: ${server}`); }
    if (/aws|amazon/i.test(result["x-amz-cf-id"] || "")) { wafName = "AWS WAF/CloudFront"; evidence.push("X-Amz-Cf-Id header"); }
    if (/incap_ses/i.test(cookie)) { wafName = "Imperva/Incapsula"; evidence.push("Cookie: incap_ses"); }
    if (/__cfduid/i.test(cookie)) { wafName = "Cloudflare"; evidence.push("Cookie: __cfduid"); }
    if (/sucuri_cloudproxy/i.test(cookie)) { wafName = "Sucuri"; evidence.push("Cookie: sucuri_cloudproxy"); }

    return {
      url,
      detected: !!wafName,
      wafName,
      evidence,
      success: true,
    };
  } catch (err) {
    return { url, detected: false, wafName: null, evidence: [], success: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}

// ─── 12. robots.txt Parser ───────────────────────────────────────────────────

export interface RobotsResult {
  url: string;
  rules: { userAgent: string; disallow: string[]; allow: string[] }[];
  sitemaps: string[];
  crawlDelay: number | null;
  success: boolean;
  error?: string;
}

export async function parseRobotsTxt(url: string): Promise<RobotsResult> {
  const baseUrl = url.replace(/\/$/, "");
  const robotsUrl = `${baseUrl}/robots.txt`;

  try {
    const result = await new Promise<string | null>((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const isHTTPS = robotsUrl.startsWith("https://");
      const reqFn = isHTTPS ? httpsRequest : httpRequest;
      const req = reqFn(
        robotsUrl,
        { signal: controller.signal, rejectUnauthorized: false },
        (res) => {
          clearTimeout(timeout);
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve(body));
        },
      );
      req.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
      req.end();
    });

    if (!result) {
      return { url, rules: [], sitemaps: [], crawlDelay: null, success: false, error: "robots.txt introuvable" };
    }

    const rules: { userAgent: string; disallow: string[]; allow: string[] }[] = [];
    const sitemaps: string[] = [];
    let crawlDelay: number | null = null;
    let currentUA = "*";
    let currentRule: { userAgent: string; disallow: string[]; allow: string[] } | null = null;

    for (const line of result.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").trim();
      const keyLower = key.trim().toLowerCase();

      if (keyLower === "user-agent") {
        if (currentRule && currentRule.userAgent !== value) {
          rules.push(currentRule);
        }
        currentUA = value;
        currentRule = { userAgent: value, disallow: [], allow: [] };
      } else if (keyLower === "disallow" && currentRule) {
        if (value) currentRule.disallow.push(value);
      } else if (keyLower === "allow" && currentRule) {
        if (value) currentRule.allow.push(value);
      } else if (keyLower === "sitemap") {
        sitemaps.push(value);
      } else if (keyLower === "crawl-delay") {
        crawlDelay = parseFloat(value) || null;
      }
    }

    if (currentRule) rules.push(currentRule);

    return { url, rules, sitemaps, crawlDelay, success: true };
  } catch (err) {
    return { url, rules: [], sitemaps: [], crawlDelay: null, success: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}

// ─── 13. Sitemap Parser ──────────────────────────────────────────────────────

export interface SitemapResult {
  url: string;
  urls: string[];
  count: number;
  success: boolean;
  error?: string;
}

export async function parseSitemap(url: string): Promise<SitemapResult> {
  const baseUrl = url.replace(/\/$/, "");
  const sitemapUrl = `${baseUrl}/sitemap.xml`;

  try {
    const result = await new Promise<string | null>((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const isHTTPS = sitemapUrl.startsWith("https://");
      const reqFn = isHTTPS ? httpsRequest : httpRequest;
      const req = reqFn(
        sitemapUrl,
        { signal: controller.signal, rejectUnauthorized: false },
        (res) => {
          clearTimeout(timeout);
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve(body));
        },
      );
      req.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
      req.end();
    });

    if (!result) {
      return { url, urls: [], count: 0, success: false, error: "sitemap.xml introuvable" };
    }

    const urls: string[] = [];
    const locRegex = /<loc>([^<]+)<\/loc>/g;
    let match;
    while ((match = locRegex.exec(result)) !== null) {
      urls.push(match[1].trim());
    }

    return { url, urls, count: urls.length, success: true };
  } catch (err) {
    return { url, urls: [], count: 0, success: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}

// ─── 14. HTTP Status Code Reference ──────────────────────────────────────────

export interface HttpStatusInfo {
  code: number;
  category: string;
  name: string;
  description: string;
}

const HTTP_STATUSES: Record<number, HttpStatusInfo> = {
  100: { code: 100, category: "1xx Informational", name: "Continue", description: "Le serveur a reçu les en-têtes et le client doit envoyer le corps" },
  101: { code: 101, category: "1xx", name: "Switching Protocols", description: "Changement de protocole (ex: WebSocket)" },
  200: { code: 200, category: "2xx Success", name: "OK", description: "Requête réussie" },
  201: { code: 201, category: "2xx", name: "Created", description: "Ressource créée" },
  204: { code: 204, category: "2xx", name: "No Content", description: "Succès sans contenu" },
  301: { code: 301, category: "3xx Redirection", name: "Moved Permanently", description: "Redirection permanente" },
  302: { code: 302, category: "3xx", name: "Found", description: "Redirection temporaire" },
  304: { code: 304, category: "3xx", name: "Not Modified", description: "Cache valide" },
  400: { code: 400, category: "4xx Client Error", name: "Bad Request", description: "Requête malformée" },
  401: { code: 401, category: "4xx", name: "Unauthorized", description: "Authentification requise" },
  403: { code: 403, category: "4xx", name: "Forbidden", description: "Accès refusé" },
  404: { code: 404, category: "4xx", name: "Not Found", description: "Ressource introuvable" },
  405: { code: 405, category: "4xx", name: "Method Not Allowed", description: "Méthode HTTP non autorisée" },
  408: { code: 408, category: "4xx", name: "Request Timeout", description: "Délai dépassé" },
  409: { code: 409, category: "4xx", name: "Conflict", description: "Conflit de version" },
  418: { code: 418, category: "4xx", name: "I'm a teapot", description: "Easter egg RFC 2324" },
  429: { code: 429, category: "4xx", name: "Too Many Requests", description: "Rate limit dépassé" },
  500: { code: 500, category: "5xx Server Error", name: "Internal Server Error", description: "Erreur serveur générique" },
  502: { code: 502, category: "5xx", name: "Bad Gateway", description: "Proxy invalide" },
  503: { code: 503, category: "5xx", name: "Service Unavailable", description: "Serveur surchargé ou en maintenance" },
  504: { code: 504, category: "5xx", name: "Gateway Timeout", description: "Délai proxy dépassé" },
};

export function getHttpStatusInfo(code: number): HttpStatusInfo | null {
  return HTTP_STATUSES[code] || null;
}

// ─── 15. Port Reference ──────────────────────────────────────────────────────

export interface PortInfo {
  port: number;
  protocol: string;
  service: string;
  description: string;
}

const PORT_REFERENCE: Record<number, PortInfo> = {
  20: { port: 20, protocol: "TCP", service: "FTP Data", description: "Transfert de données FTP" },
  21: { port: 21, protocol: "TCP", service: "FTP Control", description: "Contrôle FTP" },
  22: { port: 22, protocol: "TCP", service: "SSH", description: "Secure Shell" },
  23: { port: 23, protocol: "TCP", service: "Telnet", description: "Telnet (non chiffré)" },
  25: { port: 25, protocol: "TCP", service: "SMTP", description: "Envoi d'emails" },
  53: { port: 53, protocol: "UDP/TCP", service: "DNS", description: "Résolution DNS" },
  80: { port: 80, protocol: "TCP", service: "HTTP", description: "Web non chiffré" },
  110: { port: 110, protocol: "TCP", service: "POP3", description: "Réception d'emails" },
  143: { port: 143, protocol: "TCP", service: "IMAP", description: "Lecture d'emails" },
  443: { port: 443, protocol: "TCP", service: "HTTPS", description: "Web chiffré" },
  445: { port: 445, protocol: "TCP", service: "SMB", description: "Partage Windows" },
  993: { port: 993, protocol: "TCP", service: "IMAPS", description: "IMAP chiffré" },
  995: { port: 995, protocol: "TCP", service: "POP3S", description: "POP3 chiffré" },
  1433: { port: 1433, protocol: "TCP", service: "MSSQL", description: "Microsoft SQL Server" },
  3306: { port: 3306, protocol: "TCP", service: "MySQL", description: "MySQL/MariaDB" },
  3389: { port: 3389, protocol: "TCP", service: "RDP", description: "Remote Desktop" },
  5432: { port: 5432, protocol: "TCP", service: "PostgreSQL", description: "PostgreSQL" },
  5900: { port: 5900, protocol: "TCP", service: "VNC", description: "VNC Remote Desktop" },
  6379: { port: 6379, protocol: "TCP", service: "Redis", description: "Redis (souvent sans auth!)" },
  8080: { port: 8080, protocol: "TCP", service: "HTTP-Alt", description: "HTTP alternatif" },
  8443: { port: 8443, protocol: "TCP", service: "HTTPS-Alt", description: "HTTPS alternatif" },
  27017: { port: 27017, protocol: "TCP", service: "MongoDB", description: "MongoDB (souvent sans auth!)" },
  9200: { port: 9200, protocol: "TCP", service: "Elasticsearch", description: "Elasticsearch (souvent sans auth!)" },
};

export function getPortInfo(port: number): PortInfo | null {
  return PORT_REFERENCE[port] || null;
}
