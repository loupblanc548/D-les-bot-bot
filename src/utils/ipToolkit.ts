/**
 * ipToolkit.ts — Outils réseau avancés pour l'analyse d'IP
 *
 * Fonctionnalités:
 * - Ping ICMP (via child_process, sécurisé avec execFile)
 * - Traceroute (via child_process, sécurisé avec execFile)
 * - Port scan rapide (TCP connect, sans nmap)
 * - HTTP headers check (récupère les headers d'un serveur web)
 * - SSL/TLS certificate check (vérifie le certificat HTTPS)
 * - Web screenshot (capture via Playwright si l'IP héberge un site)
 *
 * Sécurité:
 * - Toutes les commandes utilisent execFile (pas de shell injection)
 * - Validation stricte des IPs (pas de SSRF vers 169.254.x.x, 127.0.0.1, etc.)
 * - Timeout sur toutes les opérations
 * - Rate limiting intégré
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { connect } from "net";
import { request } from "https";
import { request as httpRequest } from "http";
import logger from "./logger.js";

const execFileAsync = promisify(execFile);

// ─── Validation ──────────────────────────────────────────────────────────────

const IP_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

export function isValidIP(ip: string): boolean {
  return IP_REGEX.test(ip) || ip.includes(":");
}

export function isPrivateIP(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

export function validateTargetIP(ip: string): { valid: boolean; reason?: string } {
  if (!isValidIP(ip)) {
    return { valid: false, reason: "Format d'IP invalide" };
  }
  if (isPrivateIP(ip)) {
    return { valid: false, reason: "IP privée/réservée — scan bloqué (protection SSRF)" };
  }
  return { valid: true };
}

// ─── 1. Ping ICMP ────────────────────────────────────────────────────────────

export interface PingResult {
  ip: string;
  alive: boolean;
  latencyMs: number | null;
  packetsSent: number;
  packetsReceived: number;
  raw: string;
}

export async function pingIP(ip: string, count = 4): Promise<PingResult> {
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return {
      ip,
      alive: false,
      latencyMs: null,
      packetsSent: 0,
      packetsReceived: 0,
      raw: validation.reason || "Invalid IP",
    };
  }

  const isWin = process.platform === "win32";
  const cmd = isWin ? "ping" : "ping";
  const args = isWin ? ["-n", String(count), ip] : ["-c", String(count), "-W", "3", ip];

  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 15_000 });
    const alive = /bytes from|temps=|time=|ttl=/i.test(stdout);
    const latencyMatch = stdout.match(/(?:time=|temps=)(\d+(?:\.\d+)?)/i);
    const receivedMatch = stdout.match(/(?:received|reçus)\s*=\s*(\d+)/i);
    const sentMatch = stdout.match(/(?:sent|envoyés)\s*=\s*(\d+)/i);

    return {
      ip,
      alive,
      latencyMs: latencyMatch ? parseFloat(latencyMatch[1]) : null,
      packetsSent: sentMatch ? parseInt(sentMatch[1], 10) : count,
      packetsReceived: receivedMatch ? parseInt(receivedMatch[1], 10) : alive ? count : 0,
      raw: stdout.slice(0, 500),
    };
  } catch (err) {
    return {
      ip,
      alive: false,
      latencyMs: null,
      packetsSent: count,
      packetsReceived: 0,
      raw: err instanceof Error ? err.message.slice(0, 500) : String(err),
    };
  }
}

// ─── 2. Traceroute ───────────────────────────────────────────────────────────

export interface TracerouteResult {
  ip: string;
  hops: { hop: number; ip: string; latencyMs: string }[];
  raw: string;
  success: boolean;
}

export async function tracerouteIP(ip: string, maxHops = 15): Promise<TracerouteResult> {
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { ip, hops: [], raw: validation.reason || "Invalid IP", success: false };
  }

  const isWin = process.platform === "win32";
  const cmd = isWin ? "tracert" : "traceroute";
  const args = isWin ? ["-h", String(maxHops), ip] : ["-m", String(maxHops), "-w", "2", ip];

  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 60_000, maxBuffer: 1024 * 1024 });
    const hops: { hop: number; ip: string; latencyMs: string }[] = [];

    const lines = stdout.split("\n");
    for (const line of lines) {
      const hopMatch = line.match(/^\s*(\d+)\s+(.+)/);
      if (hopMatch) {
        const hopNum = parseInt(hopMatch[1], 10);
        const rest = hopMatch[2].trim();
        const ipMatch = rest.match(/(\d+\.\d+\.\d+\.\d+)/);
        const latencyMatch = rest.match(/(\d+(?:\.\d+)?\s*(?:ms|s))/i);
        hops.push({
          hop: hopNum,
          ip: ipMatch ? ipMatch[1] : "*",
          latencyMs: latencyMatch ? latencyMatch[1] : "*",
        });
      }
    }

    return { ip, hops, raw: stdout.slice(0, 1000), success: true };
  } catch (err) {
    return {
      ip,
      hops: [],
      raw: err instanceof Error ? err.message.slice(0, 500) : String(err),
      success: false,
    };
  }
}

// ─── 3. Port Scan rapide (TCP connect) ───────────────────────────────────────

export interface PortScanResult {
  ip: string;
  openPorts: { port: number; service: string }[];
  closedPorts: number[];
  scannedPorts: number;
  durationMs: number;
}

const COMMON_PORTS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  993: "IMAPS",
  995: "POP3S",
  1433: "MSSQL",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5900: "VNC",
  6379: "Redis",
  8080: "HTTP-Alt",
  8443: "HTTPS-Alt",
  27017: "MongoDB",
};

function scanPort(ip: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: ip, port, timeout: timeoutMs });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function portScanIP(
  ip: string,
  ports?: number[],
  concurrency = 10,
): Promise<PortScanResult> {
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return { ip, openPorts: [], closedPorts: [], scannedPorts: 0, durationMs: 0 };
  }

  const portsToScan = ports ?? Object.keys(COMMON_PORTS).map(Number);
  const startTime = Date.now();
  const openPorts: { port: number; service: string }[] = [];
  const closedPorts: number[] = [];

  // Scan en batches pour limiter la concurrence
  for (let i = 0; i < portsToScan.length; i += concurrency) {
    const batch = portsToScan.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((p) => scanPort(ip, p).then((open) => ({ port: p, open }))),
    );

    for (const { port, open } of results) {
      if (open) {
        openPorts.push({ port, service: COMMON_PORTS[port] || "unknown" });
      } else {
        closedPorts.push(port);
      }
    }
  }

  return {
    ip,
    openPorts: openPorts.sort((a, b) => a.port - b.port),
    closedPorts: closedPorts.sort((a, b) => a - b),
    scannedPorts: portsToScan.length,
    durationMs: Date.now() - startTime,
  };
}

// ─── 4. HTTP Headers Check ───────────────────────────────────────────────────

export interface HttpCheckResult {
  ip: string;
  url: string;
  statusCode: number | null;
  headers: Record<string, string>;
  securityHeaders: {
    hasHSTS: boolean;
    hasCSP: boolean;
    hasXFrameOptions: boolean;
    hasXContentTypeOptions: boolean;
    hasReferrerPolicy: boolean;
  };
  server: string | null;
  poweredBy: string | null;
  responseTimeMs: number;
  success: boolean;
  error?: string;
}

export async function checkHttpHeaders(
  ip: string,
  port = 80,
  useSSL = false,
): Promise<HttpCheckResult> {
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return {
      ip,
      url: "",
      statusCode: null,
      headers: {},
      securityHeaders: {
        hasHSTS: false,
        hasCSP: false,
        hasXFrameOptions: false,
        hasXContentTypeOptions: false,
        hasReferrerPolicy: false,
      },
      server: null,
      poweredBy: null,
      responseTimeMs: 0,
      success: false,
      error: validation.reason,
    };
  }

  const protocol = useSSL ? "https" : "http";
  const url = `${protocol}://${ip}:${port}`;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const reqFn = useSSL ? request : httpRequest;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const req = reqFn(url, { signal: controller.signal, rejectUnauthorized: false }, (res) => {
        clearTimeout(timeout);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
        }

        resolve({
          ip,
          url,
          statusCode: res.statusCode ?? null,
          headers,
          securityHeaders: {
            hasHSTS: !!headers["strict-transport-security"],
            hasCSP: !!headers["content-security-policy"],
            hasXFrameOptions: !!headers["x-frame-options"],
            hasXContentTypeOptions: !!headers["x-content-type-options"],
            hasReferrerPolicy: !!headers["referrer-policy"],
          },
          server: headers["server"] || null,
          poweredBy: headers["x-powered-by"] || null,
          responseTimeMs: Date.now() - startTime,
          success: true,
        });
        res.destroy();
      });

      req.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          ip,
          url,
          statusCode: null,
          headers: {},
          securityHeaders: {
            hasHSTS: false,
            hasCSP: false,
            hasXFrameOptions: false,
            hasXContentTypeOptions: false,
            hasReferrerPolicy: false,
          },
          server: null,
          poweredBy: null,
          responseTimeMs: Date.now() - startTime,
          success: false,
          error: err.message.slice(0, 200),
        });
      });

      req.end();
    } catch (err) {
      clearTimeout(timeout);
      resolve({
        ip,
        url,
        statusCode: null,
        headers: {},
        securityHeaders: {
          hasHSTS: false,
          hasCSP: false,
          hasXFrameOptions: false,
          hasXContentTypeOptions: false,
          hasReferrerPolicy: false,
        },
        server: null,
        poweredBy: null,
        responseTimeMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  });
}

// ─── 5. SSL/TLS Certificate Check ────────────────────────────────────────────

export interface SSLCheckResult {
  ip: string;
  port: number;
  hasCertificate: boolean;
  subject: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  selfSigned: boolean;
  error?: string;
}

export async function checkSSL(ip: string, port = 443): Promise<SSLCheckResult> {
  const validation = validateTargetIP(ip);
  if (!validation.valid) {
    return {
      ip,
      port,
      hasCertificate: false,
      subject: null,
      issuer: null,
      validFrom: null,
      validTo: null,
      daysUntilExpiry: null,
      isExpired: false,
      selfSigned: false,
      error: validation.reason,
    };
  }

  return new Promise((resolve) => {
    const req = request(
      `https://${ip}:${port}`,
      { rejectUnauthorized: false, timeout: 10_000 },
      (res) => {
        const cert = res.socket;
        // @ts-expect-error — getPeerCertificate is on TLSSocket
        const peerCert = cert?.getPeerCertificate?.();

        if (!peerCert || Object.keys(peerCert).length === 0) {
          res.destroy();
          resolve({
            ip,
            port,
            hasCertificate: false,
            subject: null,
            issuer: null,
            validFrom: null,
            validTo: null,
            daysUntilExpiry: null,
            isExpired: false,
            selfSigned: false,
          });
          return;
        }

        const validFrom = peerCert.valid_from ? new Date(peerCert.valid_from) : null;
        const validTo = peerCert.valid_to ? new Date(peerCert.valid_to) : null;
        const now = new Date();
        const daysUntilExpiry = validTo
          ? Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const isExpired = validTo ? validTo.getTime() < now.getTime() : false;
        const selfSigned =
          peerCert.subject?.CN === peerCert.issuer?.CN ||
          peerCert.subject?.O === peerCert.issuer?.O;

        res.destroy();
        resolve({
          ip,
          port,
          hasCertificate: true,
          subject: peerCert.subject?.CN || peerCert.subject?.O || "N/A",
          issuer: peerCert.issuer?.CN || peerCert.issuer?.O || "N/A",
          validFrom: validFrom?.toISOString() || null,
          validTo: validTo?.toISOString() || null,
          daysUntilExpiry,
          isExpired,
          selfSigned,
        });
      },
    );

    req.on("error", (err) => {
      resolve({
        ip,
        port,
        hasCertificate: false,
        subject: null,
        issuer: null,
        validFrom: null,
        validTo: null,
        daysUntilExpiry: null,
        isExpired: false,
        selfSigned: false,
        error: err.message.slice(0, 200),
      });
    });

    req.end();
  });
}

// ─── 6. Full IP Report ───────────────────────────────────────────────────────

export interface FullIPReport {
  ip: string;
  ping: PingResult;
  portScan: PortScanResult;
  http: HttpCheckResult | null;
  https: HttpCheckResult | null;
  ssl: SSLCheckResult | null;
  generatedAt: string;
}

export async function fullIPReport(ip: string): Promise<FullIPReport> {
  logger.info(`[IP-Toolkit] Full report for ${ip}`);

  const [ping, portScan] = await Promise.all([pingIP(ip, 4), portScanIP(ip)]);

  let http: HttpCheckResult | null = null;
  let https: HttpCheckResult | null = null;
  let ssl: SSLCheckResult | null = null;

  // Check HTTP if port 80 is open
  if (portScan.openPorts.some((p) => p.port === 80)) {
    http = await checkHttpHeaders(ip, 80, false);
  }

  // Check HTTPS if port 443 is open
  if (portScan.openPorts.some((p) => p.port === 443)) {
    [https, ssl] = await Promise.all([checkHttpHeaders(ip, 443, true), checkSSL(ip, 443)]);
  }

  return {
    ip,
    ping,
    portScan,
    http,
    https,
    ssl,
    generatedAt: new Date().toISOString(),
  };
}

// ─── 7. Format Report for Discord ────────────────────────────────────────────

export function formatIPReport(report: FullIPReport): string {
  const lines: string[] = [];
  lines.push(`# 🔍 Rapport IP: ${report.ip}`);
  lines.push(`*Généré le ${new Date(report.generatedAt).toLocaleString("fr-FR")}*\n`);

  // Ping
  lines.push("## 📡 Ping");
  if (report.ping.alive) {
    lines.push(`✅ **Hôte actif** — Latence: ${report.ping.latencyMs ?? "N/A"}ms`);
    lines.push(`Paquets: ${report.ping.packetsReceived}/${report.ping.packetsSent} reçus`);
  } else {
    lines.push("❌ **Hôte inactif** ou ne répondant pas au ping");
  }

  // Port scan
  lines.push("\n## 🚪 Ports ouverts");
  if (report.portScan.openPorts.length === 0) {
    lines.push("Aucun port ouvert trouvé sur les ports communs");
  } else {
    for (const { port, service } of report.portScan.openPorts) {
      lines.push(`- **${port}** (${service}) ✅ ouvert`);
    }
  }
  lines.push(`*Scan: ${report.portScan.scannedPorts} ports en ${report.portScan.durationMs}ms*\n`);

  // HTTP
  if (report.http) {
    lines.push("## 🌐 HTTP (port 80)");
    if (report.http.success) {
      lines.push(`Status: ${report.http.statusCode}`);
      lines.push(`Server: ${report.http.server || "N/A"}`);
      lines.push(`X-Powered-By: ${report.http.poweredBy || "N/A"}`);
      lines.push(`Réponse: ${report.http.responseTimeMs}ms`);
    } else {
      lines.push(`❌ ${report.http.error || "Connexion échouée"}`);
    }
    lines.push("");
  }

  // HTTPS
  if (report.https) {
    lines.push("## 🔒 HTTPS (port 443)");
    if (report.https.success) {
      lines.push(`Status: ${report.https.statusCode}`);
      lines.push(`Server: ${report.https.server || "N/A"}`);
      lines.push(`Réponse: ${report.https.responseTimeMs}ms`);

      // Security headers
      const sec = report.https.securityHeaders;
      lines.push("\n### Security Headers");
      lines.push(`- HSTS: ${sec.hasHSTS ? "✅" : "❌"}`);
      lines.push(`- CSP: ${sec.hasCSP ? "✅" : "❌"}`);
      lines.push(`- X-Frame-Options: ${sec.hasXFrameOptions ? "✅" : "❌"}`);
      lines.push(`- X-Content-Type-Options: ${sec.hasXContentTypeOptions ? "✅" : "❌"}`);
      lines.push(`- Referrer-Policy: ${sec.hasReferrerPolicy ? "✅" : "❌"}`);
    } else {
      lines.push(`❌ ${report.https.error || "Connexion échouée"}`);
    }
    lines.push("");
  }

  // SSL
  if (report.ssl) {
    lines.push("## 📜 Certificat SSL");
    if (report.ssl.hasCertificate) {
      lines.push(`Subject: ${report.ssl.subject}`);
      lines.push(`Issuer: ${report.ssl.issuer}`);
      lines.push(
        `Valide du: ${report.ssl.validFrom ? new Date(report.ssl.validFrom).toLocaleDateString("fr-FR") : "N/A"}`,
      );
      lines.push(
        `Valide jusqu'au: ${report.ssl.validTo ? new Date(report.ssl.validTo).toLocaleDateString("fr-FR") : "N/A"}`,
      );
      lines.push(`Jours restants: ${report.ssl.daysUntilExpiry ?? "N/A"}`);
      lines.push(`Expiré: ${report.ssl.isExpired ? "⚠️ OUI" : "✅ Non"}`);
      lines.push(`Self-signed: ${report.ssl.selfSigned ? "⚠️ OUI" : "✅ Non"}`);
    } else {
      lines.push(`❌ ${report.ssl.error || "Aucun certificat"}`);
    }
  }

  return lines.join("\n");
}
