import prisma from "../../prisma";

// ===== Constantes de détection de liens suspects =====
const SUSPICIOUS_TLDS = new Set([
  "tk", "ml", "ga", "cf", "gq", "xyz", "top", "click", "download",
  "work", "review", "country", "science", "party", "gdn", "stream",
]);

const SUSPICIOUS_PATTERNS: RegExp[] = [
  /discord-?nitro/i,
  /free-?nitro/i,
  /airdrop/i,
  /@everyone/i,
  /steam-?community/i,
  /discord-?gift/i,
  /verify-?your-?account/i,
  /steal/i,
];

const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd",
  "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy",
]);

/**
 * Vérifie rapidement si une chaîne contient des liens suspects.
 * (Utilisé par l'event messages pour le filtrage temps réel)
 */
export function checkSuspiciousLinks(content: string): boolean {
  return checkSuspiciousLinksDetailed(content).length > 0;
}

/**
 * Variante détaillée qui retourne la liste des flags détectés.
 * (Utilisé par la commande /linkcheck pour afficher un rapport)
 */
export function checkSuspiciousLinksDetailed(content: string): string[] {
  const flags: string[] = [];
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const urls = content.match(urlRegex) || [];

  for (const url of urls) {
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      flags.push("URL malformée");
      continue;
    }

    // IP directe
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      flags.push("IP directe : " + host);
      continue;
    }

    // TLD suspect
    const tld = host.split(".").pop() || "";
    if (SUSPICIOUS_TLDS.has(tld)) {
      flags.push("TLD suspect : ." + tld);
    }

    // Raccourcisseur d'URL
    if (URL_SHORTENERS.has(host)) {
      flags.push("Raccourcisseur d'URL : " + host);
    }

    // Motifs de phishing
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(content) || pattern.test(url)) {
        flags.push("Motif suspect : " + pattern.source);
      }
    }
  }

  return flags;
}

/** Vérifie si l'anti-phishing est activé pour une guilde (avec cache). */
export async function isAntiPhishingActive(guildId: string): Promise<boolean> {
  const cached = antiPhishingCache.get(guildId);
  if (cached && Date.now() - cached.cachedAt < ANTI_PHISHING_CACHE_TTL_MS) {
    return cached.active;
  }
  try {
    const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
    const active = cfg?.antiPhishing ?? false;
    antiPhishingCache.set(guildId, { active, cachedAt: Date.now() });
    return active;
  } catch {
    return false;
  }
}

/** Vérifie si l'anti-raid est activé pour une guilde (avec cache). */
export async function isAntiRaidActive(guildId: string): Promise<{ active: boolean; seuilHeures: number }> {
  const cached = antiRaidCache.get(guildId);
  if (cached && Date.now() - cached.cachedAt < ANTI_RAID_CACHE_TTL_MS) {
    return { active: cached.active, seuilHeures: cached.seuilHeures };
  }
  try {
    const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
    const active = cfg?.antiRaidEnabled ?? false;
    const seuilHeures = cfg?.antiRaidSeuilHeures ?? 24;
    antiRaidCache.set(guildId, { active, seuilHeures, cachedAt: Date.now() });
    return { active, seuilHeures };
  } catch {
    return { active: false, seuilHeures: 24 };
  }
}

// Réimports des caches et constantes pour les helpers isActive
import { antiRaidCache, ANTI_RAID_CACHE_TTL_MS } from "./cache";
import { antiPhishingCache, ANTI_PHISHING_CACHE_TTL_MS } from "./cache";
