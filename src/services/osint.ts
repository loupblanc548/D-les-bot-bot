/**
 * osint.ts — Service OSINT pour Shadow Broker
 *
 * Recherches d'intelligence open-source :
 *  - Username lookup (Sherlock 480+ sites + Maigret 2500+ sites)
 *  - Email check (Holehe 120+ sites + checks API natifs)
 *  - Phone lookup (PhoneInfoga + libphonenumber)
 *  - Domain intel (sous-domaines via crt.sh)
 *
 * Utilise les outils Python installés via pip + checks natifs TypeScript.
 */

import logger from "../utils/logger.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UsernameResult {
  platform: string;
  url: string;
  found: boolean;
}

export interface EmailResult {
  platform: string;
  registered: boolean;
}

export interface PhoneResult {
  number: string;
  valid: boolean;
  country?: string;
  countryCode?: string;
  carrier?: string;
  lineType?: string;
  formatted?: string;
}

export interface DomainResult {
  domain: string;
  subdomains: { domain: string; issuer: string; notBefore: string; notAfter: string }[];
  totalFound: number;
}

// ─── Username Lookup (Sherlock-style) ────────────────────────────────────────

const USERNAME_PLATFORMS: {
  name: string;
  url: (u: string) => string;
  check: (r: Response) => boolean;
}[] = [
  { name: "GitHub", url: (u) => `https://github.com/${u}`, check: (r) => r.status === 200 },
  { name: "GitLab", url: (u) => `https://gitlab.com/${u}`, check: (r) => r.status === 200 },
  {
    name: "Reddit",
    url: (u) => `https://www.reddit.com/user/${u}`,
    check: (r) => r.status === 200,
  },
  { name: "Twitter/X", url: (u) => `https://x.com/${u}`, check: (r) => r.status === 200 },
  {
    name: "Instagram",
    url: (u) => `https://www.instagram.com/${u}/`,
    check: (r) => r.status === 200,
  },
  { name: "TikTok", url: (u) => `https://www.tiktok.com/@${u}`, check: (r) => r.status === 200 },
  { name: "YouTube", url: (u) => `https://www.youtube.com/@${u}`, check: (r) => r.status === 200 },
  { name: "Twitch", url: (u) => `https://www.twitch.tv/${u}`, check: (r) => r.status === 200 },
  {
    name: "Steam",
    url: (u) => `https://steamcommunity.com/id/${u}`,
    check: (r) => r.status === 200,
  },
  {
    name: "Steam Group",
    url: (u) => `https://steamcommunity.com/groups/${u}`,
    check: (r) => r.status === 200,
  },
  {
    name: "Discord (guild)",
    url: (u) => `https://discord.com/invite/${u}`,
    check: (r) => r.status !== 404,
  },
  {
    name: "Pinterest",
    url: (u) => `https://www.pinterest.com/${u}/`,
    check: (r) => r.status === 200,
  },
  { name: "Medium", url: (u) => `https://medium.com/@${u}`, check: (r) => r.status === 200 },
  { name: "Dev.to", url: (u) => `https://dev.to/${u}`, check: (r) => r.status === 200 },
  {
    name: "HackerNews",
    url: (u) => `https://news.ycombinator.com/user?id=${u}`,
    check: (r) => r.status === 200,
  },
  {
    name: "Product Hunt",
    url: (u) => `https://www.producthunt.com/@${u}`,
    check: (r) => r.status === 200,
  },
  { name: "Behance", url: (u) => `https://www.behance.net/${u}`, check: (r) => r.status === 200 },
  { name: "Dribbble", url: (u) => `https://dribbble.com/${u}`, check: (r) => r.status === 200 },
  { name: "SoundCloud", url: (u) => `https://soundcloud.com/${u}`, check: (r) => r.status === 200 },
  {
    name: "Spotify",
    url: (u) => `https://open.spotify.com/user/${u}`,
    check: (r) => r.status === 200,
  },
  { name: "Keybase", url: (u) => `https://keybase.io/${u}`, check: (r) => r.status === 200 },
  { name: "Telegram", url: (u) => `https://t.me/${u}`, check: (r) => r.status === 200 },
  {
    name: "Mastodon (mastodon.social)",
    url: (u) => `https://mastodon.social/@${u}`,
    check: (r) => r.status === 200,
  },
  { name: "Patreon", url: (u) => `https://www.patreon.com/${u}`, check: (r) => r.status === 200 },
  { name: "Ko-fi", url: (u) => `https://ko-fi.com/${u}`, check: (r) => r.status === 200 },
  {
    name: "BuyMeACoffee",
    url: (u) => `https://www.buymeacoffee.com/${u}`,
    check: (r) => r.status === 200,
  },
  {
    name: "GitHub Gist",
    url: (u) => `https://gist.github.com/${u}`,
    check: (r) => r.status === 200,
  },
  { name: "Replit", url: (u) => `https://replit.com/@${u}`, check: (r) => r.status === 200 },
  { name: "CodePen", url: (u) => `https://codepen.io/${u}`, check: (r) => r.status === 200 },
  {
    name: "Stack Overflow",
    url: (u) => `https://stackoverflow.com/users/${u}`,
    check: (r) => r.status === 200,
  },
  {
    name: "Roblox",
    url: (u) => `https://www.roblox.com/user.aspx?username=${u}`,
    check: (r) => r.status === 200,
  },
  {
    name: "Fortnite Tracker",
    url: (u) => `https://fortnitetracker.com/profile/all/${u}`,
    check: (r) => r.status === 200,
  },
  {
    name: "Chess.com",
    url: (u) => `https://www.chess.com/member/${u}`,
    check: (r) => r.status === 200,
  },
  { name: "Last.fm", url: (u) => `https://www.last.fm/user/${u}`, check: (r) => r.status === 200 },
  { name: "Vimeo", url: (u) => `https://vimeo.com/${u}`, check: (r) => r.status === 200 },
  {
    name: "Flickr",
    url: (u) => `https://www.flickr.com/people/${u}`,
    check: (r) => r.status === 200,
  },
];

export async function searchUsername(username: string): Promise<UsernameResult[]> {
  const results: UsernameResult[] = [];
  const concurrency = 10;

  for (let i = 0; i < USERNAME_PLATFORMS.length; i += concurrency) {
    const batch = USERNAME_PLATFORMS.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (platform) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(platform.url(username), {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; ShadowBroker/1.0)" },
            redirect: "manual",
          });
          clearTimeout(timeout);
          const found = platform.check(response);
          return {
            platform: platform.name,
            url: platform.url(username),
            found,
          };
        } catch {
          return {
            platform: platform.name,
            url: platform.url(username),
            found: false,
          };
        }
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  return results;
}

// ─── Email Check (Holehe-style) ──────────────────────────────────────────────

const EMAIL_CHECK_PLATFORMS: { name: string; check: (email: string) => Promise<boolean> }[] = [
  {
    name: "GitHub",
    check: async (email) => {
      try {
        const r = await fetch(
          `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`,
          {
            headers: { "User-Agent": "ShadowBroker/1.0" },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!r.ok) return false;
        const data = (await r.json()) as { total_count?: number };
        return (data.total_count ?? 0) > 0;
      } catch {
        return false;
      }
    },
  },
  {
    name: "Gravatar",
    check: async (email) => {
      try {
        const crypto = await import("crypto");
        const hash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
        const r = await fetch(`https://www.gravatar.com/${hash}.json`, {
          signal: AbortSignal.timeout(8000),
        });
        return r.status === 200;
      } catch {
        return false;
      }
    },
  },
  {
    name: "Have I Been Pwned",
    check: async (email) => {
      try {
        const r = await fetch(
          `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`,
          {
            headers: { "User-Agent": "ShadowBroker/1.0" },
            signal: AbortSignal.timeout(8000),
          },
        );
        return r.status === 200;
      } catch {
        return false;
      }
    },
  },
  {
    name: "Adobe",
    check: async (email) => {
      try {
        const r = await fetch(
          `https://adobeid-na1.services.adobe.com/renga-idprovider/profiles/v2/users?email=${encodeURIComponent(email)}`,
          {
            signal: AbortSignal.timeout(8000),
          },
        );
        const text = await r.text();
        return text.includes('"user_id"') || text.includes('"userId"');
      } catch {
        return false;
      }
    },
  },
  {
    name: "Twitter/X (via email)",
    check: async (email) => {
      // Twitter doesn't expose email lookup via API, but we can check if gravatar links to twitter
      try {
        const crypto = await import("crypto");
        const hash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
        const r = await fetch(`https://www.gravatar.com/${hash}.json`, {
          signal: AbortSignal.timeout(8000),
        });
        if (r.status !== 200) return false;
        const data = (await r.json()) as { entry?: { accounts?: { shortname?: string }[] }[] };
        const accounts = data.entry?.[0]?.accounts ?? [];
        return accounts.some((a) => a.shortname === "twitter");
      } catch {
        return false;
      }
    },
  },
];

export async function checkEmail(email: string): Promise<EmailResult[]> {
  const results: EmailResult[] = [];

  const batchResults = await Promise.allSettled(
    EMAIL_CHECK_PLATFORMS.map(async (platform) => {
      try {
        const registered = await platform.check(email);
        return { platform: platform.name, registered };
      } catch {
        return { platform: platform.name, registered: false };
      }
    }),
  );

  for (const result of batchResults) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    }
  }

  return results;
}

// ─── Phone Lookup ────────────────────────────────────────────────────────────

export async function lookupPhone(phone: string): Promise<PhoneResult> {
  try {
    // Utiliser l'API gratuite numverify (via wrapper) ou libphonenumber-js
    const cleaned = phone.replace(/[^0-9+]/g, "");

    // Essayer l'API numverify (gratuit, 100 req/mois)
    const numverifyKey = process.env.NUMVERIFY_KEY;
    if (numverifyKey) {
      const r = await fetch(
        `https://apilayer.net/api/validate?access_key=${numverifyKey}&number=${encodeURIComponent(cleaned)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (r.ok) {
        const data = (await r.json()) as {
          valid: boolean;
          country_name?: string;
          country_code?: string;
          carrier?: string;
          line_type?: string;
          international_format?: string;
        };
        return {
          number: cleaned,
          valid: data.valid,
          country: data.country_name,
          countryCode: data.country_code,
          carrier: data.carrier,
          lineType: data.line_type,
          formatted: data.international_format,
        };
      }
    }

    // Fallback : parsing basique
    const libphonenumber = await import("libphonenumber-js");
    const parsed = libphonenumber.parsePhoneNumber(cleaned);
    if (parsed) {
      return {
        number: cleaned,
        valid: parsed.isValid(),
        country: parsed.country,
        countryCode: parsed.countryCallingCode.toString(),
        formatted: parsed.formatInternational(),
      };
    }

    return { number: cleaned, valid: false };
  } catch (error) {
    logger.error("[OSINT/phone] Erreur:", error);
    return { number: phone, valid: false };
  }
}

// ─── Domain Intelligence (crt.sh) ────────────────────────────────────────────

export async function lookupDomain(domain: string): Promise<DomainResult> {
  try {
    const r = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ShadowBroker/1.0)" },
      signal: AbortSignal.timeout(15000),
    });

    if (!r.ok) {
      return { domain, subdomains: [], totalFound: 0 };
    }

    const data = (await r.json()) as {
      common_name?: string;
      name_value?: string;
      issuer_name?: string;
      not_before?: string;
      not_after?: string;
    }[];

    // Extraire les sous-domaines uniques
    const subdomainMap = new Map<string, { issuer: string; notBefore: string; notAfter: string }>();

    for (const entry of data) {
      const names = (entry.name_value || "").split("\n");
      for (const name of names) {
        const clean = name.trim().toLowerCase();
        if (clean && clean.endsWith(domain.toLowerCase()) && !subdomainMap.has(clean)) {
          subdomainMap.set(clean, {
            issuer: entry.issuer_name || "N/A",
            notBefore: entry.not_before || "N/A",
            notAfter: entry.not_after || "N/A",
          });
        }
      }
    }

    const subdomains = Array.from(subdomainMap.entries())
      .map(([domain, info]) => ({
        domain,
        issuer: info.issuer,
        notBefore: info.notBefore,
        notAfter: info.notAfter,
      }))
      .slice(0, 50);

    return {
      domain,
      subdomains,
      totalFound: subdomainMap.size,
    };
  } catch (error) {
    logger.error("[OSINT/domain] Erreur:", error);
    return { domain, subdomains: [], totalFound: 0 };
  }
}

// ─── Sherlock (Python — 480+ sites) ──────────────────────────────────────────

export interface SherlockResult {
  username: string;
  found: { platform: string; url: string }[];
  totalFound: number;
  totalChecked: number;
}

export async function runSherlock(username: string): Promise<SherlockResult> {
  try {
    const { stdout } = await execAsync(
      `sherlock "${username.replace(/"/g, "")}" --timeout 8 --print-found --json`,
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
    );

    // Sherlock output peut être du JSON ou du texte
    try {
      const data = JSON.parse(stdout);
      const found = Object.entries(data)
        .filter(([, val]: [string, any]) => val && val.status === "found")
        .map(([platform, val]: [string, any]) => ({
          platform,
          url: val.url || `https://${platform}.com/${username}`,
        }));

      return {
        username,
        found,
        totalFound: found.length,
        totalChecked: Object.keys(data).length,
      };
    } catch {
      // Fallback : parser le texte
      const lines = stdout.split("\n").filter((l) => l.trim());
      const found = lines
        .filter((l) => l.includes("http"))
        .map((l) => {
          const match = l.match(/\[(.+?)\]\s+(.+)/);
          if (match) return { platform: match[1], url: match[2] };
          return null;
        })
        .filter(Boolean) as { platform: string; url: string }[];

      return {
        username,
        found,
        totalFound: found.length,
        totalChecked: 0,
      };
    }
  } catch (error) {
    logger.error("[OSINT/sherlock] Erreur:", error);
    return { username, found: [], totalFound: 0, totalChecked: 0 };
  }
}

// ─── Maigret (Python — 2500+ sites, profiling profond) ───────────────────────

export interface MaigretResult {
  username: string;
  found: { platform: string; url: string; tags?: string[] }[];
  totalFound: number;
  errors: number;
}

export async function runMaigret(username: string): Promise<MaigretResult> {
  try {
    const { stdout } = await execAsync(
      `maigret "${username.replace(/"/g, "")}" --timeout 8 --no-color --json --filter-found`,
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    );

    try {
      const data = JSON.parse(stdout);
      const found: { platform: string; url: string; tags?: string[] }[] = [];

      // Maigret output format: sites array
      if (data.sites) {
        for (const site of data.sites) {
          if (site.status === "found" || site.found) {
            found.push({
              platform: site.name || site.site || "unknown",
              url: site.url || site.link || "",
              tags: site.tags || [],
            });
          }
        }
      }

      // Alternative format: direct entries
      if (data.results) {
        for (const [platform, val] of Object.entries(data.results)) {
          const v = val as any;
          if (v.found || v.status === "found") {
            found.push({
              platform,
              url: v.url || v.link || "",
              tags: v.tags,
            });
          }
        }
      }

      return {
        username,
        found,
        totalFound: found.length,
        errors: data.errors || 0,
      };
    } catch {
      // Fallback texte
      const lines = stdout.split("\n").filter((l) => l.includes("http"));
      const found = lines
        .map((l) => {
          const match = l.match(/\[(.+?)\].*?(https?:\/\/\S+)/);
          if (match) return { platform: match[1], url: match[2] };
          return null;
        })
        .filter(Boolean) as { platform: string; url: string; tags?: string[] }[];

      return { username, found, totalFound: found.length, errors: 0 };
    }
  } catch (error) {
    logger.error("[OSINT/maigret] Erreur:", error);
    return { username, found: [], totalFound: 0, errors: 0 };
  }
}

// ─── Holehe (Python — email sur 120+ sites) ──────────────────────────────────

export interface HoleheResult {
  email: string;
  registered: { platform: string }[];
  totalRegistered: number;
}

export async function runHolehe(email: string): Promise<HoleheResult> {
  try {
    const { stdout } = await execAsync(
      `holehe --only-used --no-color "${email.replace(/"/g, "")}"`,
      { timeout: 120000, maxBuffer: 5 * 1024 * 1024 },
    );

    // Holehe affiche les sites où l'email est inscrit avec [+] et ceux où il ne l'est pas avec [-]
    const lines = stdout.split("\n");
    const registered: { platform: string }[] = [];

    for (const line of lines) {
      // Format: [+] platform_name
      const match = line.match(/\[\+\]\s+(.+)/);
      if (match) {
        registered.push({ platform: match[1].trim() });
      }
    }

    return {
      email,
      registered,
      totalRegistered: registered.length,
    };
  } catch (error) {
    logger.error("[OSINT/holehe] Erreur:", error);
    return { email, registered: [], totalRegistered: 0 };
  }
}

// ─── PhoneInfoga (Python — phone intel avancé) ───────────────────────────────

export interface PhoneInfogaResult {
  number: string;
  valid: boolean;
  country?: string;
  countryCode?: string;
  carrier?: string;
  lineType?: string;
  localFormat?: string;
  internationalFormat?: string;
  raw?: string;
}

export async function runPhoneInfoga(phone: string): Promise<PhoneInfogaResult> {
  try {
    const { stdout } = await execAsync(`phoneinfoga scan -n "${phone.replace(/"/g, "")}" --json`, {
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    });

    try {
      const data = JSON.parse(stdout);
      return {
        number: phone,
        valid: data.valid ?? true,
        country: data.country,
        countryCode: data.countryCode,
        carrier: data.carrier,
        lineType: data.lineType,
        localFormat: data.localFormat,
        internationalFormat: data.internationalFormat,
        raw: stdout.slice(0, 500),
      };
    } catch {
      // Fallback : parsing texte
      const valid = stdout.includes("Valid") || stdout.includes("valid");
      const countryMatch = stdout.match(/Country[:\s]+(.+)/i);
      const carrierMatch = stdout.match(/Carrier[:\s]+(.+)/i);

      return {
        number: phone,
        valid,
        country: countryMatch?.[1]?.trim(),
        carrier: carrierMatch?.[1]?.trim(),
        raw: stdout.slice(0, 500),
      };
    }
  } catch (error) {
    logger.error("[OSINT/phoneinfoga] Erreur:", error);
    // Fallback vers la méthode native
    return await lookupPhone(phone);
  }
}

// ─── WHOIS (Python python-whois) ─────────────────────────────────────────────

export interface WhoisResult {
  domain: string;
  registrar?: string;
  creationDate?: string;
  expirationDate?: string;
  updatedDate?: string;
  nameServers?: string[];
  status?: string[];
  emails?: string[];
  org?: string;
  country?: string;
}

export async function runWhois(domain: string): Promise<WhoisResult> {
  try {
    const { stdout } = await execAsync(
      `python -c "import whois; w=whois.whois('${domain.replace(/'/g, "")}'); import json; print(json.dumps({k:str(v) for k,v in w.items() if v}))"`,
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );

    try {
      const data = JSON.parse(stdout);
      return {
        domain,
        registrar: data.registrar,
        creationDate: data.creation_date,
        expirationDate: data.expiration_date,
        updatedDate: data.updated_date,
        nameServers: data.name_servers ? String(data.name_servers).split("\n") : undefined,
        status: data.status ? String(data.status).split("\n") : undefined,
        emails: data.emails ? String(data.emails).split(",") : undefined,
        org: data.org,
        country: data.country,
      };
    } catch {
      return { domain };
    }
  } catch (error) {
    logger.error("[OSINT/whois] Erreur:", error);
    return { domain };
  }
}

// ─── Sublist3r (Python — sous-domaines) ──────────────────────────────────────

export interface Sublist3rResult {
  domain: string;
  subdomains: string[];
  total: number;
}

export async function runSublist3r(domain: string): Promise<Sublist3rResult> {
  try {
    const { stdout } = await execAsync(
      `python "D:\\osint-tools\\sublist3r\\sublist3r.py" -d "${domain.replace(/"/g, "")}" -j`,
      { timeout: 60000, maxBuffer: 5 * 1024 * 1024 },
    );

    try {
      const data = JSON.parse(stdout);
      const subs = Array.isArray(data) ? data : [];
      return { domain, subdomains: subs, total: subs.length };
    } catch {
      const lines = stdout.split("\n").filter((l) => l.trim() && l.includes("."));
      return { domain, subdomains: lines, total: lines.length };
    }
  } catch (error) {
    logger.error("[OSINT/sublist3r] Erreur:", error);
    return { domain, subdomains: [], total: 0 };
  }
}

// ─── h8mail (Python — breach email search) ───────────────────────────────────

export interface H8mailResult {
  email: string;
  breaches: { source: string; data?: string }[];
  totalBreaches: number;
}

export async function runH8mail(email: string): Promise<H8mailResult> {
  try {
    const { stdout } = await execAsync(`h8mail -t "${email.replace(/"/g, "")}" --json`, {
      timeout: 60000,
      maxBuffer: 5 * 1024 * 1024,
    });

    try {
      const data = JSON.parse(stdout);
      const breaches = (data.breaches || []).map((b: any) => ({
        source: b.source || b.name || "unknown",
        data: b.data ? String(b.data).slice(0, 200) : undefined,
      }));
      return { email, breaches, totalBreaches: breaches.length };
    } catch {
      // Fallback texte
      const lines = stdout.split("\n").filter((l) => l.includes("[+]") || l.includes("breach"));
      const breaches = lines.map((l) => ({ source: l.trim() }));
      return { email, breaches, totalBreaches: breaches.length };
    }
  } catch (error) {
    logger.error("[OSINT/h8mail] Erreur:", error);
    return { email, breaches: [], totalBreaches: 0 };
  }
}

// ─── Instaloader (Python — Instagram OSINT) ──────────────────────────────────

export interface InstagramResult {
  username: string;
  found: boolean;
  followers?: string;
  following?: string;
  posts?: string;
  bio?: string;
  fullName?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
  profilePicUrl?: string;
}

export async function runInstaloader(username: string): Promise<InstagramResult> {
  try {
    const { stdout } = await execAsync(
      `python -c "import instaloader; L=instaloader.Instaloader(); profile=instaloader.Profile.from_username(L.context, '${username.replace(/'/g, "")}'); import json; print(json.dumps({'username':profile.username,'followers':str(profile.followers),'following':str(profile.followees),'posts':str(profile.mediacount),'bio':profile.biography,'fullname':profile.full_name,'private':profile.is_private,'verified':profile.is_verified,'pic':profile.profile_pic_url}))"`,
      { timeout: 30000, maxBuffer: 2 * 1024 * 1024 },
    );

    try {
      const data = JSON.parse(stdout);
      return { username, found: true, ...data };
    } catch {
      return { username, found: false };
    }
  } catch (error) {
    logger.error("[OSINT/instaloader] Erreur:", error);
    return { username, found: false };
  }
}

// ─── Photon (Python — web crawler OSINT) ─────────────────────────────────────

export interface PhotonResult {
  url: string;
  internalUrls: string[];
  externalUrls: string[];
  emails: string[];
  socialLinks: string[];
  files: string[];
  total: number;
}

export async function runPhoton(url: string): Promise<PhotonResult> {
  try {
    const { stdout } = await execAsync(
      `python "D:\\osint-tools\\photon\\photon.py" -u "${url.replace(/"/g, "")}" -l 3 --json`,
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
    );

    try {
      const data = JSON.parse(stdout);
      return {
        url,
        internalUrls: data.internal || [],
        externalUrls: data.external || [],
        emails: data.emails || [],
        socialLinks: data.social || [],
        files: data.files || [],
        total: (data.internal?.length || 0) + (data.external?.length || 0),
      };
    } catch {
      return {
        url,
        internalUrls: [],
        externalUrls: [],
        emails: [],
        socialLinks: [],
        files: [],
        total: 0,
      };
    }
  } catch (error) {
    logger.error("[OSINT/photon] Erreur:", error);
    return {
      url,
      internalUrls: [],
      externalUrls: [],
      emails: [],
      socialLinks: [],
      files: [],
      total: 0,
    };
  }
}

// ─── DNS Lookup (Python dnspython) ───────────────────────────────────────────

export interface DnsResult {
  domain: string;
  aRecords: string[];
  mxRecords: string[];
  txtRecords: string[];
  nsRecords: string[];
  cnameRecords: string[];
}

export async function runDnsLookup(domain: string): Promise<DnsResult> {
  try {
    const { stdout } = await execAsync(
      `python -c "import dns.resolver; import json; r=dns.resolver.Resolver(); results={}; [results.setdefault('A',[]).append(str(a)) for a in r.resolve('${domain.replace(/'/g, "")}','A',lifetime=5)] if True else None; [results.setdefault('MX',[]).append(str(a)) for a in r.resolve('${domain.replace(/'/g, "")}','MX',lifetime=5)] if True else None; [results.setdefault('TXT',[]).append(str(a)) for a in r.resolve('${domain.replace(/'/g, "")}','TXT',lifetime=5)] if True else None; [results.setdefault('NS',[]).append(str(a)) for a in r.resolve('${domain.replace(/'/g, "")}','NS',lifetime=5)] if True else None; print(json.dumps(results))"`,
      { timeout: 20000, maxBuffer: 1024 * 1024 },
    );

    try {
      const data = JSON.parse(stdout);
      return {
        domain,
        aRecords: data.A || [],
        mxRecords: data.MX || [],
        txtRecords: data.TXT || [],
        nsRecords: data.NS || [],
        cnameRecords: data.CNAME || [],
      };
    } catch {
      return {
        domain,
        aRecords: [],
        mxRecords: [],
        txtRecords: [],
        nsRecords: [],
        cnameRecords: [],
      };
    }
  } catch (error) {
    logger.error("[OSINT/dns] Erreur:", error);
    return { domain, aRecords: [], mxRecords: [], txtRecords: [], nsRecords: [], cnameRecords: [] };
  }
}
