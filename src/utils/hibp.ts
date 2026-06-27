/**
 * hibp.ts — Integration Have I Been Pwned API v3.
 *
 * Permet de verifier si un email a ete compromis dans une fuite de donnees.
 *
 * Plan gratuit pour usage non-commercial.
 * Config: HIBP_API_KEY dans .env (obtenir sur https://haveibeenpwned.com/API/Key)
 * Si non configure, no-op (retourne null).
 */

import logger from "./logger.js";

const API_KEY = process.env.HIBP_API_KEY || "";
const BASE_URL = "https://haveibeenpwned.com/api/v3";

export interface BreachInfo {
  name: string;
  domain: string;
  breachDate: string;
  compromisedData: string[];
  description: string;
}

interface HIBPBreach {
  Name: string;
  Domain: string;
  BreachDate: string;
  DataClasses: string[];
  Description: string;
}

/**
 * Verifie si un email a ete compromis dans des fuites de donnees.
 * Retourne un tableau de breaches, ou null si l'API n'est pas configuree.
 */
export async function checkEmail(email: string): Promise<BreachInfo[] | null> {
  if (!API_KEY) return null;

  try {
    const res = await fetch(
      `${BASE_URL}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          "hibp-api-key": API_KEY,
          "User-Agent": "Discord-Surveillance-Bot",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (res.status === 404) return []; // Pas de breach
    if (!res.ok) {
      logger.warn(`[HIBP] HTTP ${res.status}`);
      return null;
    }

    const breaches = (await res.json()) as HIBPBreach[];
    return breaches.map((b) => ({
      name: b.Name,
      domain: b.Domain,
      breachDate: b.BreachDate,
      compromisedData: b.DataClasses,
      description: b.Description,
    }));
  } catch (err) {
    logger.debug(`[HIBP] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Verifie si un mot de passe a ete compromis (via l'API Pwned Passwords).
 * Ne requiere pas de cle API — utilise le range search (k-anonymity).
 * Retourne le nombre de fois ou le hash du password apparait dans les fuites.
 */
export async function checkPassword(password: string): Promise<number> {
  try {
    // SHA-1 hash du password
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
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return 0;

    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
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
