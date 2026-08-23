import { searchShodan, getHostInfo, isShodanConfigured } from "./shodan.js";
import { fullDnsLookup, whoisLookup, assessDomainRisk, checkEmailSecurity } from "./dnsResolver.js";
import logger from "../utils/logger.js";

export interface OsintReport {
  target: string;
  type: "ip" | "domain" | "email";
  shodan: { configured: boolean; results: any } | null;
  dns: { records: any; mx: any; ns: string[]; txt: string[]; a: string[] } | null;
  whois: {
    registrar: string;
    creationDate: string;
    expirationDate: string;
    registrantCountry: string;
  } | null;
  emailSecurity: { spf: boolean; dmarc: boolean; dkim: boolean } | null;
  riskScore: number;
  riskReasons: string[];
}

export async function runOsintScan(target: string): Promise<OsintReport> {
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(target);
  const isEmail = /^[^@]+@[^@]+\.[^@]+$/.test(target);
  const type: OsintReport["type"] = isIP ? "ip" : isEmail ? "email" : "domain";
  const report: OsintReport = {
    target,
    type,
    shodan: null,
    dns: null,
    whois: null,
    emailSecurity: null,
    riskScore: 0,
    riskReasons: [],
  };

  if (isIP) {
    if (isShodanConfigured()) {
      const host = await getHostInfo(target);
      report.shodan = { configured: true, results: host };
    } else {
      report.shodan = { configured: false, results: null };
    }
  } else if (type === "domain") {
    const [dns, whois, risk] = await Promise.all([
      fullDnsLookup(target).catch((): null => null),
      whoisLookup(target).catch((): null => null),
      assessDomainRisk(target).catch((): { score: number; reasons: string[] } => ({
        score: 0,
        reasons: [],
      })),
    ]);
    if (dns) report.dns = { records: dns.records, mx: dns.mx, ns: dns.ns, txt: dns.txt, a: dns.a };
    if (whois)
      report.whois = {
        registrar: whois.registrar,
        creationDate: whois.creationDate,
        expirationDate: whois.expirationDate,
        registrantCountry: whois.registrantCountry,
      };
    report.riskScore = risk.score;
    report.riskReasons = risk.reasons;
    if (isShodanConfigured() && dns && dns.a.length > 0) {
      const host = await getHostInfo(dns.a[0]).catch((): null => null);
      report.shodan = { configured: true, results: host };
    }
  } else if (type === "email") {
    const domain = target.split("@")[1];
    if (domain) {
      const emailSec = await checkEmailSecurity(domain).catch((): null => null);
      if (emailSec) {
        report.emailSecurity = emailSec;
        if (!emailSec.spf) {
          report.riskScore += 10;
          report.riskReasons.push("No SPF");
        }
        if (!emailSec.dmarc) {
          report.riskScore += 10;
          report.riskReasons.push("No DMARC");
        }
      }
    }
  }

  logger.info(`[OSINT] Scan ${target} (${type}): risk=${report.riskScore}`);
  return report;
}

export async function quickShodanSearch(
  query: string,
): Promise<{ total: number; topResults: any[] }> {
  const result = await searchShodan(query);
  return { total: result.total, topResults: result.matches.slice(0, 5) };
}
