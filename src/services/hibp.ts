/**
 * hibp.ts — Have I Been Pwned API integration.
 *
 * Checks if email addresses or passwords have been exposed in data breaches.
 * Useful for server security alerts and user safety notifications.
 *
 * Free tier: 10 requests/min with API key.
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

const BASE_URL = "https://haveibeenpwned.com/api/v3";

export function isHibpAvailable(): boolean {
  return !!config.hibpApiKey;
}

export interface Breach {
  name: string;
  domain: string;
  breachDate: string;
  compromisedAccounts: number;
  compromisedData: string[];
  description: string;
  logoUrl: string;
}

export async function checkEmail(email: string): Promise<Breach[]> {
  if (!isHibpAvailable()) return [];

  try {
    const res = await fetch(`${BASE_URL}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`, {
      headers: {
        "hibp-api-key": config.hibpApiKey,
        "User-Agent": "DiscordBot/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) return [];
    if (res.status === 429) {
      logger.warn("[HIBP] Rate limited (10 req/min)");
      return [];
    }
    if (!res.ok) {
      logger.warn(`[HIBP] HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as Array<{
      Name: string;
      Domain: string;
      BreachDate: string;
      PwnCount: number;
      DataClasses: string[];
      Description: string;
      LogoPath: string;
    }>;

    return data.map((b) => ({
      name: b.Name,
      domain: b.Domain,
      breachDate: b.BreachDate,
      compromisedAccounts: b.PwnCount,
      compromisedData: b.DataClasses,
      description: b.Description,
      logoUrl: `https://haveibeenpwned.com${b.LogoPath}`,
    }));
  } catch (error) {
    logger.warn(`[HIBP] Check error: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function checkPassword(password: string): Promise<number> {
  const { createHash } = await import("crypto");
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetch(`${BASE_URL.replace("/api/v3", "")}/range/${prefix}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return -1;

    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix) return parseInt(count, 10);
    }
    return 0;
  } catch {
    return -1;
  }
}

export async function getAllBreaches(): Promise<Breach[]> {
  if (!isHibpAvailable()) return [];

  try {
    const res = await fetch(`${BASE_URL}/breaches`, {
      headers: {
        "hibp-api-key": config.hibpApiKey,
        "User-Agent": "DiscordBot/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      Name: string;
      Domain: string;
      BreachDate: string;
      PwnCount: number;
      DataClasses: string[];
      Description: string;
      LogoPath: string;
    }>;

    return data.map((b) => ({
      name: b.Name,
      domain: b.Domain,
      breachDate: b.BreachDate,
      compromisedAccounts: b.PwnCount,
      compromisedData: b.DataClasses,
      description: b.Description,
      logoUrl: `https://haveibeenpwned.com${b.LogoPath}`,
    }));
  } catch {
    return [];
  }
}
