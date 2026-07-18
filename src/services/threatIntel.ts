/**
 * threatIntel.ts — Unified Threat Intelligence Provider
 *
 * Regroupe plusieurs sources de threat intelligence pour que le bot
 * puisse automatiquement vérifier les menaces :
 *
 *  1. VirusTotal API — scan d'URLs, fichiers, hashes
 *  2. AbuseIPDB — réputation d'IPs
 *  3. PhishTank — base d'URLs de phishing
 *  4. Google Safe Browsing — vérification d'URLs
 *  5. GitHub Dorking — recherche de leaks (API keys, tokens)
 *  6. IPVoid (agrégation) — multi-check d'IPs
 *
 * Toutes les fonctions sont conçues pour être appelées automatiquement
 * par les autres modules (anti-phishing, cyberDefense, SOC, investigator).
 */

import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThreatSource =
  | "VIRUSTOTAL"
  | "ABUSEIPDB"
  | "PHISHTANK"
  | "SAFE_BROWSING"
  | "GITHUB_DORKING"
  | "IPVOID";

export interface ThreatResult {
  source: ThreatSource;
  query: string;
  malicious: boolean;
  confidence: number; // 0-100
  details: string;
  categories: string[];
  detectedAt: Date;
  raw?: Record<string, unknown>;
}

export interface URLScanResult {
  url: string;
  results: ThreatResult[];
  overallMalicious: boolean;
  overallConfidence: number;
  scannedAt: Date;
}

export interface IPReputationResult {
  ip: string;
  results: ThreatResult[];
  isMalicious: boolean;
  abuseScore: number;
  country: string | null;
  isp: string | null;
  isProxy: boolean;
  isHosting: boolean;
  isMobile: boolean;
  city: string | null;
  region: string | null;
  scannedAt: Date;
}

export interface GitHubLeakResult {
  query: string;
  found: boolean;
  repositories: { repo: string; file: string; url: string; snippet: string }[];
  scannedAt: Date;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY ?? "";
const ABUSEIPDB_API_KEY = process.env.ABUSEIPDB_API_KEY ?? "";
const PHISHTANK_API_KEY = process.env.PHISHTANK_API_KEY ?? "";
const GOOGLE_SAFE_BROWSING_API_KEY = process.env.GOOGLE_SAFE_BROWSING_API_KEY ?? "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const cache = new Map<string, { data: unknown; timestamp: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data as T;
  }
  return null;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

// ─── 1. VirusTotal ───────────────────────────────────────────────────────────

/**
 * Scan une URL via VirusTotal.
 */
export async function scanURLVirusTotal(url: string): Promise<ThreatResult> {
  const cacheKey = `vt_url_${url}`;
  const cached = getCached<ThreatResult>(cacheKey);
  if (cached) return cached;

  const result: ThreatResult = {
    source: "VIRUSTOTAL",
    query: url,
    malicious: false,
    confidence: 0,
    details: "No API key configured",
    categories: [],
    detectedAt: new Date(),
  };

  if (!VIRUSTOTAL_API_KEY) {
    result.details = "VirusTotal API key not configured";
    return result;
  }

  try {
    const res = await fetch(
      `https://www.virustotal.com/api/v3/urls/${Buffer.from(url).toString("base64url").slice(0, 64)}`,
      {
        headers: { "x-apikey": VIRUSTOTAL_API_KEY },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      result.details = `VirusTotal HTTP ${res.status}`;
      return result;
    }

    const data = (await res.json()) as any;
    const stats = data?.data?.attributes?.last_analysis_stats ?? {};
    const maliciousCount = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
    const totalCount = Object.values(stats).reduce(
      (a: number, b: any) => a + (typeof b === "number" ? b : 0),
      0,
    );

    result.malicious = maliciousCount > 0;
    result.confidence = totalCount > 0 ? Math.round((maliciousCount / totalCount) * 100) : 0;
    result.details = `${maliciousCount}/${totalCount} engines flagged as malicious`;
    result.categories = data?.data?.attributes?.categories
      ? Object.values(data.data.attributes.categories)
      : [];
    result.raw = data;

    setCached(cacheKey, result);
  } catch (error) {
    result.details = `VirusTotal error: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(`[ThreatIntel] VirusTotal URL scan failed: ${result.details}`);
  }

  return result;
}

// ─── 1b. VirusTotal File Hash Scan ──────────────────────────────────────────

/**
 * Scan un hash de fichier (MD5, SHA1, SHA256) via VirusTotal.
 */
export async function scanFileHashVirusTotal(hash: string): Promise<ThreatResult> {
  const cacheKey = `vt_hash_${hash}`;
  const cached = getCached<ThreatResult>(cacheKey);
  if (cached) return cached;

  const result: ThreatResult = {
    source: "VIRUSTOTAL",
    query: hash,
    malicious: false,
    confidence: 0,
    details: "No API key configured",
    categories: [],
    detectedAt: new Date(),
  };

  if (!VIRUSTOTAL_API_KEY) {
    result.details = "VirusTotal API key not configured";
    return result;
  }

  try {
    const res = await fetch(
      `https://www.virustotal.com/api/v3/files/${hash}`,
      {
        headers: { "x-apikey": VIRUSTOTAL_API_KEY },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      result.details = `VirusTotal HTTP ${res.status}`;
      return result;
    }

    const data = (await res.json()) as any;
    const stats = data?.data?.attributes?.last_analysis_stats ?? {};
    const maliciousCount = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
    const totalEngines = (stats.harmless ?? 0) + (stats.undetected ?? 0) + maliciousCount;

    result.malicious = maliciousCount >= 3;
    result.confidence = totalEngines > 0 ? Math.round((maliciousCount / totalEngines) * 100) : 0;
    result.details = `${maliciousCount}/${totalEngines} engines flagged as malicious`;
    result.categories = maliciousCount >= 3 ? ["malware"] : [];
    result.raw = data;

    setCached(cacheKey, result);
  } catch (error) {
    result.details = `VirusTotal error: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(`[ThreatIntel] VirusTotal hash scan failed: ${result.details}`);
  }

  return result;
}

// ─── 2. AbuseIPDB ────────────────────────────────────────────────────────────

/**
 * Vérifie la réputation d'une IP via AbuseIPDB.
 */
export async function checkIPAbuseIPDB(ip: string): Promise<ThreatResult> {
  const cacheKey = `abuse_${ip}`;
  const cached = getCached<ThreatResult>(cacheKey);
  if (cached) return cached;

  const result: ThreatResult = {
    source: "ABUSEIPDB",
    query: ip,
    malicious: false,
    confidence: 0,
    details: "No API key configured",
    categories: [],
    detectedAt: new Date(),
  };

  if (!ABUSEIPDB_API_KEY) {
    return result;
  }

  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      {
        headers: { Key: ABUSEIPDB_API_KEY, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      result.details = `AbuseIPDB HTTP ${res.status}`;
      return result;
    }

    const data = (await res.json()) as any;
    const score = data?.data?.abuseConfidenceScore ?? 0;
    result.malicious = score >= 50;
    result.confidence = score;
    result.details = `Abuse confidence: ${score}%, ${data?.data?.totalReports ?? 0} reports, country: ${data?.data?.countryCode ?? "?"}`;
    result.categories = data?.data?.usageType ? [data.data.usageType] : [];
    result.raw = data;

    setCached(cacheKey, result);
  } catch (error) {
    result.details = `AbuseIPDB error: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(`[ThreatIntel] AbuseIPDB check failed: ${result.details}`);
  }

  return result;
}

// ─── 3. PhishTank ────────────────────────────────────────────────────────────

/**
 * Vérifie si une URL est dans la base PhishTank.
 */
export async function checkPhishTank(url: string): Promise<ThreatResult> {
  const cacheKey = `phishtank_${url}`;
  const cached = getCached<ThreatResult>(cacheKey);
  if (cached) return cached;

  const result: ThreatResult = {
    source: "PHISHTANK",
    query: url,
    malicious: false,
    confidence: 0,
    details: "No API key configured",
    categories: [],
    detectedAt: new Date(),
  };

  if (!PHISHTANK_API_KEY) {
    return result;
  }

  try {
    const body = new URLSearchParams();
    body.append("app_key", PHISHTANK_API_KEY);
    body.append("format", "json");
    body.append("url", url);

    const res = await fetch("https://checkurl.phishtank.com/checkurl/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      result.details = `PhishTank HTTP ${res.status}`;
      return result;
    }

    const data = (await res.json()) as any;
    const inDatabase = data?.results?.in_database ?? false;
    const valid = data?.results?.valid ?? false;

    result.malicious = inDatabase && valid;
    result.confidence = result.malicious ? 90 : inDatabase ? 50 : 0;
    result.details = inDatabase
      ? valid
        ? "Confirmed phishing URL"
        : "Listed but not verified"
      : "Not in PhishTank database";
    result.raw = data;

    setCached(cacheKey, result);
  } catch (error) {
    result.details = `PhishTank error: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(`[ThreatIntel] PhishTank check failed: ${result.details}`);
  }

  return result;
}

// ─── 4. Google Safe Browsing ─────────────────────────────────────────────────

/**
 * Vérifie une URL via Google Safe Browsing API.
 */
export async function checkGoogleSafeBrowsing(url: string): Promise<ThreatResult> {
  const cacheKey = `gsb_${url}`;
  const cached = getCached<ThreatResult>(cacheKey);
  if (cached) return cached;

  const result: ThreatResult = {
    source: "SAFE_BROWSING",
    query: url,
    malicious: false,
    confidence: 0,
    details: "No API key configured",
    categories: [],
    detectedAt: new Date(),
  };

  if (!GOOGLE_SAFE_BROWSING_API_KEY) {
    return result;
  }

  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${GOOGLE_SAFE_BROWSING_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "shadowbroker-bot", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      result.details = `Safe Browsing HTTP ${res.status}`;
      return result;
    }

    const data = (await res.json()) as any;
    const matches = data?.matches ?? [];

    result.malicious = matches.length > 0;
    result.confidence = result.malicious ? 95 : 0;
    result.details = result.malicious
      ? `Flagged as: ${matches.map((m: any) => m.threatType).join(", ")}`
      : "URL is safe";
    result.categories = matches.map((m: any) => m.threatType);
    result.raw = data;

    setCached(cacheKey, result);
  } catch (error) {
    result.details = `Safe Browsing error: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(`[ThreatIntel] Google Safe Browsing check failed: ${result.details}`);
  }

  return result;
}

// ─── 5. GitHub Dorking ───────────────────────────────────────────────────────

/**
 * Recherche de leaks sur GitHub (API keys, tokens, etc.)
 */
export async function githubDorkSearch(
  query: string,
  maxResults: number = 10,
): Promise<GitHubLeakResult> {
  const cacheKey = `github_${query}`;
  const cached = getCCached<GitHubLeakResult>(cacheKey);
  if (cached) return cached;

  const result: GitHubLeakResult = {
    query,
    found: false,
    repositories: [],
    scannedAt: new Date(),
  };

  if (!GITHUB_TOKEN) {
    logger.info("[ThreatIntel] GitHub token not configured — dorking skipped");
    return result;
  }

  try {
    const res = await fetch(
      `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      logger.warn(`[ThreatIntel] GitHub dorking HTTP ${res.status}`);
      return result;
    }

    const data = (await res.json()) as any;
    const items = data?.items ?? [];

    result.found = items.length > 0;
    result.repositories = items.map((item: any) => ({
      repo: item?.repository?.full_name ?? "unknown",
      file: item?.name ?? "unknown",
      url: item?.html_url ?? "",
      snippet: (item?.text_matches?.[0]?.fragment ?? "").slice(0, 200),
    }));

    setCached(cacheKey, result);
  } catch (error) {
    logger.warn(
      `[ThreatIntel] GitHub dorking failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}

function getCCached<T>(key: string): T | null {
  return getCached<T>(key);
}

// ─── 6. IPVoid (agrégation multi-check) ──────────────────────────────────────

/**
 * Vérification IP multi-source (AbuseIPDB + IP geolocation).
 */
export async function checkIPReputation(ip: string): Promise<IPReputationResult> {
  const cacheKey = `iprep_${ip}`;
  const cached = getCached<IPReputationResult>(cacheKey);
  if (cached) return cached;

  const results: ThreatResult[] = [];

  // AbuseIPDB
  const abuseResult = await checkIPAbuseIPDB(ip);
  results.push(abuseResult);

  // Géolocalisation IP + détection proxy/VPN/hosting (free, no key needed)
  try {
    const geoRes = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query&lang=fr`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
    if (geoRes.ok) {
      const geoData = (await geoRes.json()) as any;

      // Vérifier le rate limit (X-Rl header)
      const remaining = geoRes.headers.get("X-Rl");
      const ttl = geoRes.headers.get("X-Ttl");
      if (remaining === "0" && ttl) {
        logger.warn(`[ThreatIntel] ip-api rate limit atteint, retry dans ${ttl}s`);
      }

      // Détection de proxy/VPN/hosting
      const isProxy = geoData.proxy === true;
      const isHosting = geoData.hosting === true;
      const isMobile = geoData.mobile === true;
      const suspiciousFlags: string[] = [];
      if (isProxy) suspiciousFlags.push("PROXY/VPN/TOR");
      if (isHosting) suspiciousFlags.push("DATACENTER/HOSTING");
      if (isMobile) suspiciousFlags.push("MOBILE");

      // Une IP proxy+hosting est suspecte
      const geoMalicious = isProxy && isHosting;
      const geoConfidence = isProxy && isHosting ? 70 : isProxy ? 40 : isHosting ? 20 : 0;

      results.push({
        source: "IPVOID",
        query: ip,
        malicious: geoMalicious,
        confidence: geoConfidence,
        details: `Country: ${geoData.country ?? "?"}, ISP: ${geoData.isp ?? "?"}, AS: ${geoData.as ?? "?"}, Flags: ${suspiciousFlags.length > 0 ? suspiciousFlags.join(", ") : "none"}`,
        categories: suspiciousFlags,
        detectedAt: new Date(),
        raw: geoData,
      });
    }
  } catch {
    // Non-critique
  }

  const isMalicious = results.some((r) => r.malicious);
  const abuseScore = abuseResult.confidence;
  const countryResult = results.find((r) => r.source === "IPVOID");
  const geoRaw = countryResult?.raw as any;
  const country = geoRaw?.countryCode ?? null;
  const isp = geoRaw?.isp ?? null;

  const result: IPReputationResult = {
    ip,
    results,
    isMalicious,
    abuseScore,
    country,
    isp,
    isProxy: geoRaw?.proxy === true,
    isHosting: geoRaw?.hosting === true,
    isMobile: geoRaw?.mobile === true,
    city: geoRaw?.city ?? null,
    region: geoRaw?.regionName ?? null,
    scannedAt: new Date(),
  };

  setCached(cacheKey, result);
  return result;
}

// ─── API unifiée — scan URL complet ──────────────────────────────────────────

/**
 * Scan une URL via toutes les sources disponibles.
 * Utilisé automatiquement par l'anti-phishing.
 */
export async function scanURL(url: string): Promise<URLScanResult> {
  const cacheKey = `scan_url_${url}`;
  const cached = getCCached<URLScanResult>(cacheKey);
  if (cached) return cached;

  const results = await Promise.allSettled([
    scanURLVirusTotal(url),
    checkPhishTank(url),
    checkGoogleSafeBrowsing(url),
  ]);

  const threatResults: ThreatResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") threatResults.push(r.value);
  }

  const overallMalicious = threatResults.some((r) => r.malicious);
  const overallConfidence =
    threatResults.length > 0
      ? Math.round(threatResults.reduce((sum, r) => sum + r.confidence, 0) / threatResults.length)
      : 0;

  const result: URLScanResult = {
    url,
    results: threatResults,
    overallMalicious,
    overallConfidence,
    scannedAt: new Date(),
  };

  setCached(cacheKey, result);
  logger.info(
    `[ThreatIntel] URL scan: ${url} → malicious=${overallMalicious}, confidence=${overallConfidence}%`,
  );
  return result;
}

// ─── API publique ────────────────────────────────────────────────────────────

export function clearThreatIntelCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}

export function isConfigured(source: ThreatSource): boolean {
  switch (source) {
    case "VIRUSTOTAL":
      return !!VIRUSTOTAL_API_KEY;
    case "ABUSEIPDB":
      return !!ABUSEIPDB_API_KEY;
    case "PHISHTANK":
      return !!PHISHTANK_API_KEY;
    case "SAFE_BROWSING":
      return !!GOOGLE_SAFE_BROWSING_API_KEY;
    case "GITHUB_DORKING":
      return !!GITHUB_TOKEN;
    case "IPVOID":
      return true; // Uses free API
  }
}
