/**
 * threatIntelExtended.ts — Enrichissement de renseignement réseau
 *
 * Complète activeDefenseEngine.ts avec SecurityTrails, Censys, GreyNoise.
 * Lecture seule — aucun scan actif de tiers, aucune donnée personnelle identifiable.
 *
 * Toutes les APIs sont optionnelles (dégradation gracieuse si clé absente).
 */

import logger from "../utils/logger.js";

const SECURITYTRAILS_API_KEY = process.env.SECURITYTRAILS_API_KEY ?? "";
const CENSYS_API_ID = process.env.CENSYS_API_ID ?? "";
const CENSYS_API_SECRET = process.env.CENSYS_API_SECRET ?? "";
const GREYNOISE_API_KEY = process.env.GREYNOISE_API_KEY ?? "";

// ─── SecurityTrails: DNS History ─────────────────────────────────────────────

export interface DnsHistoryEntry {
  firstSeen: string;
  lastSeen: string;
  type: string;
  value: string;
}

export async function getSecurityTrailsDnsHistory(
  domain: string,
): Promise<DnsHistoryEntry[] | null> {
  if (!SECURITYTRAILS_API_KEY) {
    logger.debug("[ThreatIntelExtended] SecurityTrails API key not configured");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.securitytrails.com/v1/history/${encodeURIComponent(domain)}/dns/a`,
      {
        headers: { APIKEY: SECURITYTRAILS_API_KEY },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      logger.warn(`[ThreatIntelExtended] SecurityTrails HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      records?: Array<{
        first_seen?: string;
        last_seen?: string;
        type?: string;
        values?: Array<{ value?: string }>;
      }>;
    };

    return (data.records ?? []).map((r) => ({
      firstSeen: r.first_seen ?? "",
      lastSeen: r.last_seen ?? "",
      type: r.type ?? "A",
      value: r.values?.[0]?.value ?? "",
    }));
  } catch (err) {
    logger.warn(
      `[ThreatIntelExtended] SecurityTrails error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─── Censys: Attack Surface ──────────────────────────────────────────────────

export interface CensysHostResult {
  ip: string;
  services: Array<{ port: number; service: string; banner?: string }>;
  location?: string;
  asn?: string;
}

export async function getCensysAttackSurface(ip: string): Promise<CensysHostResult | null> {
  if (!CENSYS_API_ID || !CENSYS_API_SECRET) {
    logger.debug("[ThreatIntelExtended] Censys credentials not configured");
    return null;
  }

  try {
    const auth = Buffer.from(`${CENSYS_API_ID}:${CENSYS_API_SECRET}`).toString("base64");
    const res = await fetch(`https://search.censys.io/api/v2/hosts/${encodeURIComponent(ip)}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.warn(`[ThreatIntelExtended] Censys HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      result?: {
        ip?: string;
        services?: Array<{ port?: number; service_name?: string; banner?: string }>;
        location?: { country?: string };
        autonomous_system?: { asn?: number };
      };
    };

    const r = data.result;
    if (!r) return null;

    return {
      ip: r.ip ?? ip,
      services: (r.services ?? []).map((s) => ({
        port: s.port ?? 0,
        service: s.service_name ?? "unknown",
        banner: s.banner,
      })),
      location: r.location?.country,
      asn: r.autonomous_system?.asn ? `AS${r.autonomous_system.asn}` : undefined,
    };
  } catch (err) {
    logger.warn(
      `[ThreatIntelExtended] Censys error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─── GreyNoise: Noise Classification ─────────────────────────────────────────

export interface GreyNoiseResult {
  ip: string;
  classification: "benign" | "malicious" | "unknown";
  noise: boolean;
  riot: boolean;
  name?: string;
  category?: string;
}

export async function getGreyNoiseClassification(ip: string): Promise<GreyNoiseResult | null> {
  if (!GREYNOISE_API_KEY) {
    logger.debug("[ThreatIntelExtended] GreyNoise API key not configured");
    return null;
  }

  try {
    const res = await fetch(`https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`, {
      headers: { key: GREYNOISE_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn(`[ThreatIntelExtended] GreyNoise HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      ip?: string;
      classification?: string;
      noise?: boolean;
      riot?: boolean;
      name?: string;
      category?: string;
    };

    return {
      ip: data.ip ?? ip,
      classification: (data.classification as GreyNoiseResult["classification"]) ?? "unknown",
      noise: data.noise ?? false,
      riot: data.riot ?? false,
      name: data.name,
      category: data.category,
    };
  } catch (err) {
    logger.warn(
      `[ThreatIntelExtended] GreyNoise error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─── Combined Enrichment for Active Defense Engine ───────────────────────────

export interface ThreatIntelEnrichment {
  dnsHistory?: DnsHistoryEntry[];
  attackSurface?: CensysHostResult;
  noiseClassification?: GreyNoiseResult;
}

export async function enrichThreatIntel(
  ip: string,
  domain?: string,
): Promise<ThreatIntelEnrichment> {
  const enrichment: ThreatIntelEnrichment = {};

  const [dnsResult, censysResult, greyNoiseResult] = await Promise.allSettled([
    domain ? getSecurityTrailsDnsHistory(domain) : Promise.resolve(null),
    getCensysAttackSurface(ip),
    getGreyNoiseClassification(ip),
  ]);

  if (dnsResult.status === "fulfilled" && dnsResult.value) {
    enrichment.dnsHistory = dnsResult.value;
  }
  if (censysResult.status === "fulfilled" && censysResult.value) {
    enrichment.attackSurface = censysResult.value;
  }
  if (greyNoiseResult.status === "fulfilled" && greyNoiseResult.value) {
    enrichment.noiseClassification = greyNoiseResult.value;
  }

  return enrichment;
}
