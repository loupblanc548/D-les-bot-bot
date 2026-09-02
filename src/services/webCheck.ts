/**
 * webCheck.ts — Web-Check OSINT tool integration
 *
 * Appelle l'API Web-Check (localhost:3100) pour analyser un site web.
 * Retourne les résultats formatés pour l'agent loop.
 */

import logger from "../utils/logger.js";
import { fetchRetry } from "../utils/fetchRetry.js";

const WEBCHECK_URL = process.env.WEBCHECK_URL || "http://localhost:3100";

// Endpoints Web-Check disponibles
const WEBCHECK_ENDPOINTS: Record<string, string> = {
  ssl: "Certificat SSL",
  dns: "Enregistrements DNS",
  dnssec: "DNSSEC",
  whois: "WHOIS",
  headers: "En-têtes HTTP",
  "http-security": "Sécurité HTTP",
  hsts: "HSTS",
  ports: "Ports ouverts",
  subdomains: "Sous-domaines",
  "mail-config": "Configuration mail",
  "tech-stack": "Stack technique",
  threats: "Menaces détectées",
  "block-lists": "Listes de blocage",
  archives: "Archives Wayback",
  redirects: "Redirections",
  "robots-txt": "robots.txt",
  "security-txt": "security.txt",
  "social-tags": "Tags sociaux",
  sitemap: "Sitemap",
};

export interface WebCheckResult {
  endpoint: string;
  label: string;
  data: any;
  success: boolean;
  error?: string;
}

export interface WebCheckReport {
  url: string;
  results: WebCheckResult[];
  summary: string;
  timestamp: string;
}

/**
 * Analyse complète d'un site web via Web-Check
 */
export async function runWebCheck(domain: string): Promise<WebCheckReport> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const results: WebCheckResult[] = [];

  logger.info(`[WebCheck] 🔍 Analyse de ${cleanDomain}...`);

  // Lancer les endpoints en parallèle (batch de 5 pour éviter la surcharge)
  const entries = Object.entries(WEBCHECK_ENDPOINTS);
  const batchSize = 5;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async ([endpoint, label]) => {
        try {
          const url = `${WEBCHECK_URL}/api/${endpoint}?url=${encodeURIComponent(cleanDomain)}`;
          const response = await fetchRetry(url, {
            timeoutMs: 15_000,
            headers: { Accept: "application/json" },
          });

          if (!response.ok) {
            return {
              endpoint,
              label,
              data: null,
              success: false,
              error: `HTTP ${response.status}`,
            };
          }

          const data = await response.json();
          return { endpoint, label, data, success: true };
        } catch (err) {
          return {
            endpoint,
            label,
            data: null,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        results.push({
          endpoint: "unknown",
          label: "Inconnu",
          data: null,
          success: false,
          error: r.reason?.message || "Erreur inconnue",
        });
      }
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  logger.info(`[WebCheck] ✅ ${cleanDomain}: ${successCount} OK, ${failCount} échecs`);

  return {
    url: cleanDomain,
    results,
    summary: buildSummary(cleanDomain, results),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Analyse rapide (endpoints essentiels seulement)
 */
export async function runWebCheckQuick(domain: string): Promise<WebCheckReport> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  const quickEndpoints = [
    "whois",
    "dns",
    "ssl",
    "headers",
    "http-security",
    "tech-stack",
    "threats",
  ];
  const results: WebCheckResult[] = [];

  logger.info(`[WebCheck] ⚡ Quick scan de ${cleanDomain}...`);

  const batchResults = await Promise.allSettled(
    quickEndpoints.map(async (endpoint) => {
      const label = WEBCHECK_ENDPOINTS[endpoint] || endpoint;
      try {
        const url = `${WEBCHECK_URL}/api/${endpoint}?url=${encodeURIComponent(cleanDomain)}`;
        const response = await fetchRetry(url, {
          timeoutMs: 10_000,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          return { endpoint, label, data: null, success: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        return { endpoint, label, data, success: true };
      } catch (err) {
        return {
          endpoint,
          label,
          data: null,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  for (const r of batchResults) {
    if (r.status === "fulfilled") {
      results.push(r.value);
    } else {
      results.push({
        endpoint: "unknown",
        label: "Inconnu",
        data: null,
        success: false,
        error: r.reason?.message || "Erreur inconnue",
      });
    }
  }

  return {
    url: cleanDomain,
    results,
    summary: buildSummary(cleanDomain, results),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Appelle un endpoint spécifique
 */
export async function runWebCheckEndpoint(
  domain: string,
  endpoint: string,
): Promise<WebCheckResult> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const label = WEBCHECK_ENDPOINTS[endpoint] || endpoint;

  try {
    const url = `${WEBCHECK_URL}/api/${endpoint}?url=${encodeURIComponent(cleanDomain)}`;
    const response = await fetchRetry(url, {
      timeoutMs: 15_000,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { endpoint, label, data: null, success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { endpoint, label, data, success: true };
  } catch (err) {
    return {
      endpoint,
      label,
      data: null,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Formate le rapport pour l'agent loop (texte concis)
 */
function buildSummary(domain: string, results: WebCheckResult[]): string {
  const lines: string[] = [`📊 **Web-Check — ${domain}**\n`];

  for (const r of results) {
    if (!r.success) {
      lines.push(`❌ ${r.label}: ${r.error}`);
      continue;
    }

    const data = r.data as Record<string, any>;

    switch (r.endpoint) {
      case "whois": {
        const whois = data as { registrar?: string; created?: string; expires?: string };
        lines.push(
          `📋 WHOIS: ${whois.registrar || "N/A"} — créé ${whois.created?.slice(0, 10) || "?"} — expire ${whois.expires?.slice(0, 10) || "?"}`,
        );
        break;
      }
      case "dns": {
        const dns = data as { A?: string[]; MX?: string[]; NS?: string[] };
        lines.push(
          `🌐 DNS: ${dns.A?.length || 0} A, ${dns.MX?.length || 0} MX, ${dns.NS?.length || 0} NS`,
        );
        break;
      }
      case "ssl": {
        const ssl = data as {
          subject?: string;
          issuer?: string;
          valid?: boolean;
          daysRemaining?: number;
        };
        const status = ssl.valid ? `✅ valide (${ssl.daysRemaining}j restants)` : "❌ invalide";
        lines.push(`🔒 SSL: ${status} — ${ssl.issuer || "?"}`);
        break;
      }
      case "headers": {
        const headers = data as Record<string, string>;
        const count = Object.keys(headers).length;
        lines.push(`📨 Headers: ${count} en-têtes retournés`);
        break;
      }
      case "http-security": {
        const sec = data as { score?: number; grade?: string };
        lines.push(`🛡️ Sécurité HTTP: ${sec.grade || "?"} (score: ${sec.score ?? "?"})`);
        break;
      }
      case "tech-stack": {
        const tech = data as { technologies?: string[] };
        lines.push(`⚙️ Stack: ${tech.technologies?.slice(0, 5).join(", ") || "non détectée"}`);
        break;
      }
      case "threats": {
        const threats = data as { threats?: Array<{ type: string; url: string }> };
        const count = threats.threats?.length || 0;
        lines.push(`⚠️ Menaces: ${count} détectée(s)`);
        break;
      }
      case "dnssec": {
        const dnssec = data as { isValid?: boolean };
        lines.push(`🔐 DNSSEC: ${dnssec.isValid ? "✅ valide" : "❌ non configuré"}`);
        break;
      }
      case "ports": {
        const ports = data as { openPorts?: number[] };
        lines.push(`🔌 Ports: ${ports.openPorts?.slice(0, 10).join(", ") || "aucun ouvert"}`);
        break;
      }
      case "subdomains": {
        const subs = data as { subdomains?: string[] };
        lines.push(`🌍 Sous-domaines: ${subs.subdomains?.length || 0} trouvé(s)`);
        break;
      }
      case "redirects": {
        const redirects = data as { redirects?: Array<{ from: string; to: string }> };
        lines.push(`↩️ Redirections: ${redirects.redirects?.length || 0} détectée(s)`);
        break;
      }
      default: {
        lines.push(`ℹ️ ${r.label}: données reçues`);
        break;
      }
    }
  }

  return lines.join("\n");
}

/**
 * Formate le rapport détaillé pour Discord (embed-friendly)
 */
export function formatWebCheckForDiscord(report: WebCheckReport): string {
  const successCount = report.results.filter((r) => r.success).length;
  const failCount = report.results.filter((r) => !r.success).length;

  const lines: string[] = [
    `## 🔍 Web-Check — ${report.url}`,
    `**${successCount} checks OK** | ${failCount} échecs\n`,
  ];

  for (const r of report.results) {
    if (!r.success) continue;
    lines.push(`### ${r.label}`);
    lines.push("```json");
    lines.push(JSON.stringify(r.data, null, 2).slice(0, 500));
    lines.push("```\n");
  }

  return lines.join("\n");
}
