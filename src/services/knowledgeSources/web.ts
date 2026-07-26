/**
 * web.ts — Sources de connaissances web et réseau
 * Currency, Wayback, SSL Check, Open Graph, Unit Converter, Timezone, AbuseIPDB, VPN Detect, Robots.txt, Sitemap
 */

export async function fetchCurrencyConversion(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(\d+(?:[.,]\d+)?)\s*([a-z]{3})\s*(?:en|to|vers|in)\s*([a-z]{3})/);
  if (!match) return null;

  const amount = parseFloat(match[1].replace(",", "."));
  const from = match[2].toUpperCase();
  const to = match[3].toUpperCase();

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (!rate) return null;
    const result = (amount * rate).toFixed(2);
    return `💱 **${amount} ${from}** = **${result} ${to}** (taux: 1 ${from} = ${rate.toFixed(4)} ${to})`;
  } catch {
    return null;
  }
}

export async function fetchWayback(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/wayback|archive web|ancienne version du site|cached version/);
  if (!match) return null;

  const urlMatch = lower.match(/(https?:\/\/[^\s]+)/);
  if (!urlMatch) return null;
  const url = urlMatch[1];

  try {
    const res = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } };
    };
    const snapshot = data.archived_snapshots?.closest;
    if (!snapshot?.available) return `Aucune archive trouvée pour ${url}`;
    const date = snapshot.timestamp
      ? new Date(
          snapshot.timestamp.replace(
            /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
            "$1-$2-$3 $4:$5:$6",
          ),
        ).toLocaleString("fr-FR")
      : "?";
    return `🗄️ **Archive Wayback Machine**\n${url}\n📅 Sauvegarde la plus proche: ${date}\n🔗 ${snapshot.url}`;
  } catch {
    return null;
  }
}

export async function fetchSslCheck(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/ssl|certificat|certificate/)) return null;
  const urlMatch = lower.match(/(https?:\/\/[^\s]+)/);
  if (!urlMatch) return null;
  const domain = urlMatch[1].replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  try {
    const res = await fetch(`https://ssl-checker.io/api/v1/check/${domain}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      valid?: boolean;
      issuer?: string;
      valid_from?: string;
      valid_to?: string;
    };
    return `🔒 **SSL Certificate — ${domain}**\n\nValid: ${data.valid ? "✅" : "❌"}\nIssuer: ${data.issuer || "?"}\nFrom: ${data.valid_from || "?"}\nTo: ${data.valid_to || "?"}`;
  } catch {
    return null;
  }
}

export async function fetchOpenGraph(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/open graph|og:|preview.*url|link preview/)) return null;
  const urlMatch = lower.match(/(https?:\/\/[^\s]+)/);
  if (!urlMatch) return null;
  const url = urlMatch[1];

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const html = await res.text();
    const getMeta = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["']`));
      return m?.[1] || null;
    };
    const title = getMeta("og:title");
    const desc = getMeta("og:description");
    const image = getMeta("og:image");
    const site = getMeta("og:site_name");
    return `🔗 **Open Graph — ${url}**\n\n**Title:** ${title || "N/A"}\n**Site:** ${site || "N/A"}\n**Description:** ${desc || "N/A"}\n**Image:** ${image || "N/A"}`;
  } catch {
    return null;
  }
}

export async function fetchUnitConverter(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(km|mi|miles|m|meters|cm|in|inches|ft|feet|kg|lbs|pounds|c|f|k)\s*(?:en|to|vers|in)\s*(km|mi|miles|m|meters|cm|in|inches|ft|feet|kg|lbs|pounds|c|f|k)/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const from = match[2];
  const to = match[3];

  const conversions: Record<string, Record<string, number>> = {
    km: { mi: 0.621371, m: 1000, cm: 100000 },
    mi: { km: 1.60934, m: 1609.34, ft: 5280 },
    m: { km: 0.001, mi: 0.000621371, cm: 100, ft: 3.28084 },
    cm: { m: 0.01, in: 0.393701 },
    in: { cm: 2.54, ft: 0.0833333 },
    ft: { m: 0.3048, in: 12 },
    kg: { lbs: 2.20462 },
    lbs: { kg: 0.453592 },
    c: { f: 0 },
    f: { c: 0 },
    k: { c: 0 },
  };

  if (from === to) return `📏 **${value} ${from}** = **${value} ${to}**`;

  if ((from === "c" && to === "f") || (from === "f" && to === "c")) {
    const result = from === "c" ? (value * 9) / 5 + 32 : ((value - 32) * 5) / 9;
    return `📏 **${value}°${from.toUpperCase()}** = **${result.toFixed(2)}°${to.toUpperCase()}**`;
  }
  if (from === "k" && to === "c") return `📏 **${value}K** = **${(value - 273.15).toFixed(2)}°C**`;
  if (from === "c" && to === "k") return `📏 **${value}°C** = **${(value + 273.15).toFixed(2)}K**`;

  const factor = conversions[from]?.[to];
  if (!factor) return null;
  const result = value * factor;
  return `📏 **Conversion:** ${value} ${from} = ${result.toFixed(4)} ${to}`;
}

export async function fetchTimezoneConverter(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/heure.*à|time.*in|timezone|fuseau.*horaire/)) return null;

  const cityMatch = lower.match(/(?:à|in|at)\s+([\w\s]+)/);
  if (!cityMatch) return null;
  const city = cityMatch[1].trim();

  const timezones: Record<string, string> = {
    paris: "Europe/Paris",
    london: "Europe/London",
    "new york": "America/New_York",
    tokyo: "Asia/Tokyo",
    sydney: "Australia/Sydney",
    berlin: "Europe/Berlin",
    moscow: "Europe/Moscow",
    dubai: "Asia/Dubai",
    "los angeles": "America/Los_Angeles",
  };

  const tz = timezones[city.toLowerCase()];
  if (!tz) return null;

  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    const dateStr = now.toLocaleDateString("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
    return `🕐 **Heure à ${city}** (${tz})\n\n📅 ${dateStr}\n⏰ ${timeStr}`;
  } catch {
    return null;
  }
}

export async function fetchAbuseIpDb(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/abuseipdb|abuse.*ip|ip.*abuse|ip.*report/)) return null;
  const ipMatch = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (!ipMatch) return null;
  const ip = ipMatch[1];

  const apiKey = process.env.ABUSEIPDB_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`,
      {
        headers: { Key: apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: {
        abuseConfidenceScore?: number;
        countryCode?: string;
        usageType?: string;
        isp?: string;
        totalReports?: number;
      };
    };
    const d = data.data;
    if (!d) return null;
    return `🛡️ **AbuseIPDB — ${ip}**\n\nScore: ${d.abuseConfidenceScore}/100\nPays: ${d.countryCode || "?"}\nType: ${d.usageType || "?"}\nISP: ${d.isp || "?"}\nSignalements: ${d.totalReports || 0}`;
  } catch {
    return null;
  }
}

export async function fetchVpnDetect(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/vpn|proxy|detect.*vpn/)) return null;
  const ipMatch = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (!ipMatch) return null;
  const ip = ipMatch[1];

  const apiKey = process.env.VPN_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`https://vpnapi.io/api/${ip}?key=${apiKey}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      security?: { vpn?: boolean; proxy?: boolean; tor?: boolean };
      location?: { country?: string; city?: string };
    };
    const sec = data.security;
    if (!sec) return null;
    return `🔒 **VPN/Proxy Detection — ${ip}**\n\nVPN: ${sec.vpn ? "✅ Oui" : "❌ Non"}\nProxy: ${sec.proxy ? "✅ Oui" : "❌ Non"}\nTor: ${sec.tor ? "✅ Oui" : "❌ Non"}\nLocation: ${data.location?.city || "?"}, ${data.location?.country || "?"}`;
  } catch {
    return null;
  }
}

export async function fetchRobotsTxt(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.includes("robots.txt") && !lower.includes("robots txt")) return null;
  const urlMatch = lower.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return null;
  const domain = urlMatch[0].replace(/\/$/, "");

  try {
    const res = await fetch(`${domain}/robots.txt`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok)
      return `🤖 **robots.txt — ${domain}**\n\n❌ Pas de robots.txt trouvé (${res.status}).`;
    const text = await res.text();
    const lines = text
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .slice(0, 20);
    return `🤖 **robots.txt — ${domain}**\n\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
  } catch {
    return null;
  }
}

export async function fetchSitemap(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.includes("sitemap") && !lower.includes("plan du site")) return null;
  const urlMatch = lower.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return null;
  const domain = urlMatch[0].replace(/\/$/, "");

  try {
    const res = await fetch(`${domain}/sitemap.xml`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok)
      return `🗺️ **Sitemap — ${domain}**\n\n❌ Pas de sitemap.xml trouvé (${res.status}).`;
    const text = await res.text();
    const urls = text.match(/<loc>([^<]+)<\/loc>/g)?.slice(0, 15) || [];
    if (urls.length === 0)
      return `🗺️ **Sitemap — ${domain}**\n\nAucune URL trouvée dans le sitemap.`;
    const cleanUrls = urls.map((u) => u.replace(/<\/?loc>/g, ""));
    return `🗺️ **Sitemap — ${domain}** (${cleanUrls.length} URLs trouvées)\n\n${cleanUrls.map((u) => `• ${u}`).join("\n")}`;
  } catch {
    return null;
  }
}
