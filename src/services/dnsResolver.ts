import dns from "dns";
import { promisify } from "util";
import whois from "whois-json";
import logger from "../utils/logger.js";

const resolveTxt = promisify(dns.resolveTxt);
const resolveMx = promisify(dns.resolveMx);
const resolveNs = promisify(dns.resolveNs);
const resolveCname = promisify(dns.resolveCname);
const resolveA = promisify(dns.resolve4);
const resolveAaaa = promisify(dns.resolve6);
const reverseDns = promisify(dns.reverse);

export interface DnsRecord { type: string; value: string; }
export interface WhoisResult {
  domainName: string; registrar: string; creationDate: string; expirationDate: string;
  updatedDate: string; nameServers: string[]; status: string[];
  registrant: string; registrantEmail: string; registrantOrg: string; registrantCountry: string;
  raw: Record<string, unknown>;
}
export interface FullDnsLookup {
  domain: string; records: DnsRecord[]; mx: { priority: number; exchange: string }[];
  ns: string[]; txt: string[]; cname: string[]; a: string[]; aaaa: string[]; ptr: string[];
}

export async function fullDnsLookup(domain: string): Promise<FullDnsLookup> {
  const d = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const result: FullDnsLookup = { domain: d, records: [], mx: [], ns: [], txt: [], cname: [], a: [], aaaa: [], ptr: [] };
  const [a, aaaa, mx, ns, txt, cname] = await Promise.all([
    resolveA(d).catch(() => []), resolveAaaa(d).catch(() => []),
    resolveMx(d).catch(() => []), resolveNs(d).catch(() => []),
    resolveTxt(d).catch(() => []), resolveCname(d).catch(() => []),
  ]);
  result.a = a as string[]; result.aaaa = aaaa as string[];
  result.mx = mx as { priority: number; exchange: string }[];
  result.ns = ns as string[];
  result.txt = (txt as string[][]).map((t) => t.join(""));
  result.cname = cname as string[];
  for (const r of result.a) result.records.push({ type: "A", value: r });
  for (const r of result.aaaa) result.records.push({ type: "AAAA", value: r });
  for (const r of result.mx) result.records.push({ type: "MX", value: `${r.priority} ${r.exchange}` });
  for (const r of result.ns) result.records.push({ type: "NS", value: r });
  for (const r of result.txt) result.records.push({ type: "TXT", value: r });
  for (const r of result.cname) result.records.push({ type: "CNAME", value: r });
  for (const ip of result.a.slice(0, 3)) {
    try { const ptr = await reverseDns(ip).catch(() => []); result.ptr.push(...(ptr as string[])); } catch { /* skip */ }
  }
  return result;
}

export async function whoisLookup(domain: string): Promise<WhoisResult | null> {
  const d = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  try {
    const raw = await whois(d);
    if (!raw) return null;
    return {
      domainName: String(raw.domainName || raw.domain_name || d),
      registrar: String(raw.registrar || ""),
      creationDate: String(raw.creationDate || raw.createdDate || raw.created_date || ""),
      expirationDate: String(raw.expiryDate || raw.expirationDate || ""),
      updatedDate: String(raw.updatedDate || raw.lastUpdated || ""),
      nameServers: Array.isArray(raw.nameServers) ? raw.nameServers.map(String) : String(raw.nameServers || "").split(/\s+/).filter(Boolean),
      status: Array.isArray(raw.status) ? raw.status.map(String) : [String(raw.status || "")].filter(Boolean),
      registrant: String(raw.registrant || raw.registrantName || ""),
      registrantEmail: String(raw.registrantEmail || raw.email || ""),
      registrantOrg: String(raw.registrantOrganization || raw.org || ""),
      registrantCountry: String(raw.registrantCountry || raw.country || ""),
      raw,
    };
  } catch (err) {
    logger.error(`[DNS] WHOIS error for ${d}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function checkEmailSecurity(domain: string): Promise<{ spf: boolean; dmarc: boolean; dkim: boolean }> {
  const d = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const txt = await resolveTxt(d).catch(() => []);
  const dmarc = await resolveTxt(`_dmarc.${d}`).catch(() => []);
  const spfRecord = txt.find((t) => t.join("").startsWith("v=spf1"));
  const dmarcRecord = dmarc.find((t) => t.join("").startsWith("v=DMARC1"));
  let dkim = false;
  for (const sel of ["default", "google", "selector1", "s1"]) {
    const r = await resolveTxt(`${sel}._domainkey.${d}`).catch(() => []);
    if (r.length > 0) { dkim = true; break; }
  }
  return { spf: !!spfRecord, dmarc: !!dmarcRecord, dkim };
}

export async function assessDomainRisk(domain: string): Promise<{ score: number; reasons: string[] }> {
  let score = 0; const reasons: string[] = [];
  const w = await whoisLookup(domain);
  if (w?.creationDate) {
    const ageDays = (Date.now() - new Date(w.creationDate).getTime()) / 86400000;
    if (ageDays < 30) { score += 30; reasons.push(`Domain registered ${Math.round(ageDays)} days ago`); }
    else if (ageDays < 90) { score += 15; reasons.push(`Domain registered ${Math.round(ageDays)} days ago`); }
  }
  const suspiciousTlds = [".tk", ".ml", ".ga", ".cf", ".gq", ".top", ".xyz", ".click", ".loan"];
  if (suspiciousTlds.some((t) => domain.toLowerCase().endsWith(t))) { score += 20; reasons.push("Suspicious TLD"); }
  const emailSec = await checkEmailSecurity(domain);
  if (!emailSec.spf) { score += 10; reasons.push("No SPF record"); }
  if (!emailSec.dmarc) { score += 10; reasons.push("No DMARC record"); }
  if (domain.split(".").length > 4) { score += 15; reasons.push("Deeply nested subdomain"); }
  return { score: Math.min(score, 100), reasons };
}
