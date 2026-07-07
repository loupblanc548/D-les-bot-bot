import axios from "axios";
import logger from "../utils/logger.js";

const SHODAN_API_KEY = process.env.SHODAN_API_KEY || "";
const BASE_URL = "https://api.shodan.io";

export interface ShodanHost {
  ip: string;
  port: number;
  protocol: string;
  service: string;
  product?: string;
  version?: string;
  os?: string;
  country?: string;
  city?: string;
  org?: string;
  hostnames?: string[];
  domains?: string[];
  vulns?: string[];
  tags?: string[];
}

export async function searchShodan(query: string, page = 1): Promise<{ total: number; matches: ShodanHost[] }> {
  if (!SHODAN_API_KEY) return { total: 0, matches: [] };
  try {
    const res = await axios.get(`${BASE_URL}/shodan/host/search`, { params: { key: SHODAN_API_KEY, query, page }, timeout: 10000 });
    return {
      total: res.data.total || 0,
      matches: (res.data.matches || []).map((m: Record<string, unknown>) => ({
        ip: String(m.ip_str || m.ip || ""),
        port: Number(m.port || 0),
        protocol: String(m.transport || ""),
        service: String((m._shodan as Record<string, unknown>)?.module || String(m.data || "").slice(0, 50) || ""),
        product: String(m.product || ""),
        version: String(m.version || ""),
        os: String(m.os || ""),
        country: String(m.country_name || ""),
        city: String(m.city || ""),
        org: String(m.org || ""),
        hostnames: Array.isArray(m.hostnames) ? m.hostnames.map(String) : [],
        domains: Array.isArray(m.domains) ? m.domains.map(String) : [],
        vulns: Array.isArray(m.vulns) ? m.vulns.map(String) : [],
        tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
      })),
    };
  } catch (err) {
    logger.error(`[Shodan] Search error: ${err instanceof Error ? err.message : String(err)}`);
    return { total: 0, matches: [] };
  }
}

export async function getHostInfo(ip: string): Promise<ShodanHost | null> {
  if (!SHODAN_API_KEY) return null;
  try {
    const res = await axios.get(`${BASE_URL}/shodan/host/${ip}`, { params: { key: SHODAN_API_KEY }, timeout: 10000 });
    const d = res.data;
    return {
      ip: String(d.ip_str || ip), port: 0, protocol: "", service: "",
      product: String(d.product || ""), version: String(d.version || ""), os: String(d.os || ""),
      country: String(d.country_name || ""), city: String(d.city || ""), org: String(d.org || ""),
      hostnames: Array.isArray(d.hostnames) ? d.hostnames.map(String) : [],
      domains: Array.isArray(d.domains) ? d.domains.map(String) : [],
      vulns: Array.isArray(d.vulns) ? Object.keys(d.vulns).map(String) : [],
      tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    };
  } catch (err) {
    logger.error(`[Shodan] Host info error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function getAccountInfo(): Promise<{ credits: number; plan: string } | null> {
  if (!SHODAN_API_KEY) return null;
  try {
    const res = await axios.get(`${BASE_URL}/api-info`, { params: { key: SHODAN_API_KEY }, timeout: 10000 });
    return { credits: Number(res.data.credits || 0), plan: String(res.data.plan || "free") };
  } catch (err) {
    logger.error(`[Shodan] Account info error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function isShodanConfigured(): boolean { return SHODAN_API_KEY.length > 0; }
