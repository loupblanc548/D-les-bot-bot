/**
 * sslInspect.ts — Lecture du certificat d'un hôte (défense, pas de scan).
 */

import tls from "node:tls";
import { checkUrlForSsrf } from "../utils/ssrfGuard.js";

export interface HostCertInfo {
  domain: string;
  issuer: string;
  validTo: string | null;
  daysUntilExpiry: number | null;
  error?: string;
}

export async function inspectHostCertificate(domain: string): Promise<HostCertInfo> {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
    return {
      domain: host,
      issuer: "—",
      validTo: null,
      daysUntilExpiry: null,
      error: "Hôte invalide",
    };
  }
  const ssrf = await checkUrlForSsrf(`https://${host}`, "inspectHostCertificate");
  if (!ssrf.allowed) {
    return {
      domain: host,
      issuer: "—",
      validTo: null,
      daysUntilExpiry: null,
      error: ssrf.reason || "Hôte bloqué",
    };
  }
  return new Promise((resolve) => {
    const sock = tls.connect(443, host, { servername: host, rejectUnauthorized: false }, () => {
      const cert = sock.getPeerCertificate();
      sock.end();
      if (!cert || !Object.keys(cert).length) {
        resolve({
          domain: host,
          issuer: "—",
          validTo: null,
          daysUntilExpiry: null,
          error: "Aucun certificat",
        });
        return;
      }
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const days =
        validTo && !Number.isNaN(validTo.getTime())
          ? Math.round((validTo.getTime() - Date.now()) / 86_400_000)
          : null;
      const issuerRaw = cert.issuer?.O || cert.issuer?.CN;
      resolve({
        domain: host,
        issuer: Array.isArray(issuerRaw) ? issuerRaw.join(", ") : issuerRaw || "—",
        validTo: validTo ? validTo.toISOString() : null,
        daysUntilExpiry: days,
      });
    });
    sock.setTimeout(10_000);
    sock.on("error", () =>
      resolve({
        domain: host,
        issuer: "—",
        validTo: null,
        daysUntilExpiry: null,
        error: "Connexion impossible",
      }),
    );
    sock.on("timeout", () => {
      sock.destroy();
      resolve({
        domain: host,
        issuer: "—",
        validTo: null,
        daysUntilExpiry: null,
        error: "Timeout",
      });
    });
  });
}

export function sslWatchHosts(): string[] {
  return (process.env.SSL_WATCH_HOSTS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}
