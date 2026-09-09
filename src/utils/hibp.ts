/**
 * hibp.ts — Have I Been Pwned API v3.
 *
 * Authenticated (HIBP_API_KEY, header hibp-api-key):
 *   GET /breachedaccount/{account}
 *
 * Public (User-Agent only):
 *   GET /latestbreach
 *
 * Pwned Passwords (no key, k-anonymity SHA-1 range):
 *   GET https://api.pwnedpasswords.com/range/{prefix}
 *
 * Key: https://haveibeenpwned.com/API/Key
 * Docs: https://haveibeenpwned.com/API/v3
 */

import logger from "./logger.js";
import { sanitizeSecret } from "./env-loader.js";

const BASE_URL = "https://haveibeenpwned.com/api/v3";
const USER_AGENT = "John-Discord-Bot/1.0 (+https://github.com/loupblanc548/D-les-bot-bot)";

export interface BreachInfo {
  name: string;
  title?: string;
  domain: string;
  breachDate: string;
  pwnCount?: number;
  compromisedData: string[];
  description: string;
}

interface HIBPBreach {
  Name: string;
  Title?: string;
  Domain: string;
  BreachDate: string;
  PwnCount?: number;
  DataClasses: string[];
  Description: string;
}

function getApiKey(): string {
  const sanitized = sanitizeSecret(process.env.HIBP_API_KEY);
  return typeof sanitized === "string" ? sanitized : "";
}

export function hasHibpApiKey(): boolean {
  return getApiKey().length > 0;
}

function hibpHeaders(withKey: boolean): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (withKey) {
    const key = getApiKey();
    if (key) headers["hibp-api-key"] = key;
  }
  return headers;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapBreach(b: HIBPBreach): BreachInfo {
  return {
    name: b.Name,
    title: b.Title,
    domain: b.Domain,
    breachDate: b.BreachDate,
    pwnCount: b.PwnCount,
    compromisedData: b.DataClasses || [],
    description: stripTags(b.Description || ""),
  };
}

function warnStatus(status: number): void {
  if (status === 401 || status === 403) {
    logger.warn(`[HIBP] HTTP ${status} — clé API invalide ou accès refusé`);
  } else if (status === 429) {
    logger.warn("[HIBP] HTTP 429 — limite de débit, réessayer plus tard");
  } else {
    logger.warn(`[HIBP] HTTP ${status}`);
  }
}

async function hibpFetch(path: string, withKey: boolean): Promise<Response | null> {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      headers: hibpHeaders(withKey),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.debug(`[HIBP] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function formatEmailBreachReport(email: string, breaches: BreachInfo[]): string {
  if (breaches.length === 0) {
    return `Aucune fuite de données connue pour ${email}.`;
  }
  const lines = breaches.map((b) => {
    const data = b.compromisedData.length ? ` — ${b.compromisedData.slice(0, 6).join(", ")}` : "";
    const desc = b.description.slice(0, 180);
    return `- **${b.title || b.name}** (${b.breachDate})${data}${desc ? `: ${desc}` : ""}`;
  });
  return `${breaches.length} fuite(s) pour ${email}:\n\n${lines.join("\n")}`;
}

/**
 * Vérifie si un email apparaît dans des fuites (HIBP v3 /breachedaccount).
 * 404 → []. Clé absente / 401 / 403 / 429 / erreur réseau → null.
 */
export async function checkEmail(email: string): Promise<BreachInfo[] | null> {
  if (!hasHibpApiKey()) return null;

  const res = await hibpFetch(
    `/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
    true,
  );
  if (!res) return null;
  if (res.status === 404) return [];
  if (!res.ok) {
    warnStatus(res.status);
    return null;
  }

  const breaches = (await res.json()) as HIBPBreach[];
  return Array.isArray(breaches) ? breaches.map(mapBreach) : [];
}

/** Dernière fuite ajoutée au catalogue HIBP (endpoint public, pas de clé). */
export async function getLatestBreach(): Promise<BreachInfo | null> {
  const res = await hibpFetch("/latestbreach", false);
  if (!res || !res.ok) {
    if (res) warnStatus(res.status);
    return null;
  }
  const breach = (await res.json()) as HIBPBreach;
  if (!breach?.Name) return null;
  return mapBreach(breach);
}

/**
 * Vérifie si un mot de passe a été vu dans des fuites (Pwned Passwords, k-anonymity).
 * Ne log jamais le mot de passe. Pas de clé API.
 */
export async function checkPassword(password: string): Promise<number> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": USER_AGENT, "Add-Padding": "true" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return 0;

    const text = await res.text();
    for (const line of text.split("\n")) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix) {
        return parseInt(count, 10);
      }
    }
    return 0;
  } catch {
    return 0;
  }
}
