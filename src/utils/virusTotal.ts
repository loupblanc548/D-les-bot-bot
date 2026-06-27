/**
 * virusTotal.ts — Integration VirusTotal API v3 pour le scan d'URLs.
 *
 * Plan gratuit: 4 requetes/min, 500/jour.
 * Si VIRUSTOTAL_API_KEY n'est pas configure, no-op (retourne null).
 *
 * Utilise pour enrichir l'anti-phishing: si une URL est flaggee par
 * au moins 3 moteurs antivirus, on la considere malveillante.
 */

import logger from "./logger.js";

const API_KEY = process.env.VIRUSTOTAL_API_KEY || "";
const BASE_URL = "https://www.virustotal.com/api/v3/urls";
const MIN_POSITIVES = 3;

interface VirusTotalResponse {
  data?: {
    attributes?: {
      last_analysis_stats?: {
        malicious: number;
        suspicious: number;
        harmless: number;
        undetected: number;
      };
      reputation?: number;
    };
  };
}

export interface URLScanResult {
  isMalicious: boolean;
  maliciousCount: number;
  reputation: number;
}

/**
 * Scan une URL via VirusTotal.
 * Retourne null si l'API n'est pas configuree ou si la requete echoue.
 */
export async function scanURL(url: string): Promise<URLScanResult | null> {
  if (!API_KEY) return null;

  try {
    // VirusTotal requiert l'URL en base64 (sans padding)
    const urlId = Buffer.from(url).toString("base64").replace(/=/g, "");

    const response = await fetch(`${BASE_URL}/${urlId}`, {
      headers: {
        "x-apikey": API_KEY,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        logger.warn("[VirusTotal] Rate limit atteint (4 req/min max)");
      }
      return null;
    }

    const data = (await response.json()) as VirusTotalResponse;
    const stats = data.data?.attributes?.last_analysis_stats;
    if (!stats) return null;

    const maliciousCount = stats.malicious + stats.suspicious;
    const reputation = data.data?.attributes?.reputation ?? 0;

    return {
      isMalicious: maliciousCount >= MIN_POSITIVES,
      maliciousCount,
      reputation,
    };
  } catch (err) {
    logger.debug(
      `[VirusTotal] Erreur scan ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
