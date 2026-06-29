/**
 * osintProvider.ts — Fournisseur OSINT unifié pour Shadow Broker
 *
 * Interface unique permettant au bot d'interroger toutes les capacités
 * OSINT de Shadow Broker :
 *  - Intelligence Discord (profiling, alt-accounts, patterns, réseau)
 *  - Recherche username (35+ plateformes natif + Sherlock 480+ + Maigret 2500+)
 *  - Email check (Holehe 120+ sites + checks API natifs)
 *  - Phone lookup (PhoneInfoga + libphonenumber)
 *  - Domain intel (crt.sh + WHOIS + DNS + Sublist3r + theHarvester)
 *  - Instagram intel (Instaloader + Osintgram)
 *  - Web recon (Photon crawler + CMSeeK + EXIF + HTTP headers)
 *  - Breach check (h8mail)
 *
 * Fonctionnalités :
 *  - Cache en mémoire avec TTL configurable
 *  - Rate limiting (max requêtes concurrentes + par minute)
 *  - Timeout par requête
 *  - Journalisation de chaque appel
 *  - Gestion d'erreurs structurée
 */

import { Client } from "discord.js";
import logger from "../utils/logger.js";
import {
  searchUsername,
  checkEmail,
  lookupPhone,
  lookupDomain,
  runSherlock,
  runMaigret,
  runHolehe,
  runPhoneInfoga,
  runWhois,
  runDnsLookup,
  runSublist3r,
  runH8mail,
  runInstaloader,
  runPhoton,
  runSocialScan,
  runHarvester,
  runWhatsMyName,
  runExifExtract,
  runCmseek,
  runOsintgram,
} from "./osint.js";
import { queryShadowBroker, ShadowBrokerQueryType, ShadowBrokerResult } from "./shadowBroker.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type OSINTQueryType =
  | "username"
  | "username-fast"
  | "sherlock"
  | "maigret"
  | "wmn"
  | "email"
  | "holehe"
  | "breach"
  | "phone"
  | "phoneinfoga"
  | "domain"
  | "whois"
  | "dns"
  | "sublist3r"
  | "harvester"
  | "instagram"
  | "insta-deep"
  | "crawl"
  | "exif"
  | "cms"
  | "social"
  | "intel"
  | "network"
  | "patterns"
  | "report";

export interface OSINTResult {
  success: boolean;
  type: OSINTQueryType;
  query: string;
  data: unknown;
  durationMs: number;
  fromCache: boolean;
  error?: string;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 200;
const MAX_CONCURRENT = 3;
const MAX_PER_MINUTE = 20;

// ─── Cache & Rate Limiter ────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();
let activeQueries = 0;
const queryTimestamps: number[] = [];

function getCacheKey(type: OSINTQueryType, query: string): string {
  return `${type}:${query.toLowerCase().trim()}`;
}

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
  // LRU simple : éviction si trop d'entrées
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

function isRateLimited(): boolean {
  const now = Date.now();
  // Nettoyer les timestamps de plus d'1 minute
  while (queryTimestamps.length > 0 && now - queryTimestamps[0] > 60_000) {
    queryTimestamps.shift();
  }
  return queryTimestamps.length >= MAX_PER_MINUTE;
}

// ─── Interface unique ────────────────────────────────────────────────────────

/**
 * Interroge Shadow Broker OSINT avec cache, rate limiting, timeout et logs.
 *
 * @param client - Client Discord (requis pour intel/network/patterns/report)
 * @param type - Type de requête OSINT
 * @param query - Valeur de recherche (username, email, phone, domain, url...)
 * @param options - Options (guildId, userId, timeoutMs)
 * @returns Résultat structuré
 */
export async function queryOSINT(
  client: Client | null,
  type: OSINTQueryType,
  query: string,
  options?: { guildId?: string; userId?: string; timeoutMs?: number },
): Promise<OSINTResult> {
  const startTime = Date.now();
  const cacheKey = getCacheKey(type, query);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  logger.info(`[OSINTProvider] queryOSINT("${type}", "${query.slice(0, 50)}") démarrée`);

  // 1. Vérifier le cache
  const cached = getCached(cacheKey);
  if (cached !== null) {
    const durationMs = Date.now() - startTime;
    logger.info(`[OSINTProvider] Cache HIT pour "${type}" (${durationMs}ms)`);
    return {
      success: true,
      type,
      query,
      data: cached,
      durationMs,
      fromCache: true,
    };
  }

  // 2. Rate limiting
  if (isRateLimited()) {
    const durationMs = Date.now() - startTime;
    logger.warn(
      `[OSINTProvider] Rate limit atteint (${MAX_PER_MINUTE}/min) — requête "${type}" rejetée`,
    );
    return {
      success: false,
      type,
      query,
      data: null,
      durationMs,
      fromCache: false,
      error: `Rate limit: max ${MAX_PER_MINUTE} requêtes par minute`,
    };
  }

  // 3. Limite concurrente
  if (activeQueries >= MAX_CONCURRENT) {
    const durationMs = Date.now() - startTime;
    logger.warn(
      `[OSINTProvider] Limite concurrente atteinte (${activeQueries}/${MAX_CONCURRENT}) — requête "${type}" rejetée`,
    );
    return {
      success: false,
      type,
      query,
      data: null,
      durationMs,
      fromCache: false,
      error: `Limite concurrente: max ${MAX_CONCURRENT} requêtes simultanées`,
    };
  }

  activeQueries++;
  queryTimestamps.push(Date.now());

  try {
    // 4. Timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms)`)), timeoutMs),
    );

    const queryPromise = executeOSINTQuery(client, type, query, options);

    const data = await Promise.race([queryPromise, timeoutPromise]);

    // 5. Mettre en cache
    setCached(cacheKey, data);

    const durationMs = Date.now() - startTime;
    logger.info(
      `[OSINTProvider] queryOSINT("${type}", "${query.slice(0, 50)}") réussie en ${durationMs}ms`,
    );

    return {
      success: true,
      type,
      query,
      data,
      durationMs,
      fromCache: false,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      `[OSINTProvider] queryOSINT("${type}", "${query.slice(0, 50)}") échouée en ${durationMs}ms: ${errorMsg}`,
    );
    return {
      success: false,
      type,
      query,
      data: null,
      durationMs,
      fromCache: false,
      error: errorMsg,
    };
  } finally {
    activeQueries--;
  }
}

// ─── Exécution réelle ────────────────────────────────────────────────────────

async function executeOSINTQuery(
  client: Client | null,
  type: OSINTQueryType,
  query: string,
  options?: { guildId?: string; userId?: string },
): Promise<unknown> {
  switch (type) {
    // ── Intelligence Discord (Shadow Broker) ──
    case "intel":
    case "network":
    case "patterns":
    case "report": {
      if (!client) throw new Error("Client Discord requis pour ce type de requête");
      const sbType = type as ShadowBrokerQueryType;
      const result: ShadowBrokerResult = await queryShadowBroker(client, sbType, {
        userId: options?.userId,
        guildId: options?.guildId,
      });
      if (!result.success) throw new Error(result.error ?? "Échec Shadow Broker");
      return result.data;
    }

    // ── Username search ──
    case "username":
    case "username-fast":
      return searchUsername(query);
    case "sherlock":
      return runSherlock(query);
    case "maigret":
      return runMaigret(query);
    case "wmn":
      return runWhatsMyName(query);

    // ── Email ──
    case "email":
      return checkEmail(query);
    case "holehe":
      return runHolehe(query);
    case "breach":
      return runH8mail(query);

    // ── Phone ──
    case "phone":
      return lookupPhone(query);
    case "phoneinfoga":
      return runPhoneInfoga(query);

    // ── Domain ──
    case "domain":
      return lookupDomain(query);
    case "whois":
      return runWhois(query);
    case "dns":
      return runDnsLookup(query);
    case "sublist3r":
      return runSublist3r(query);
    case "harvester":
      return runHarvester(query);

    // ── Instagram ──
    case "instagram":
      return runInstaloader(query);
    case "insta-deep":
      return runOsintgram(query);

    // ── Web recon ──
    case "crawl":
      return runPhoton(query);
    case "exif":
      return runExifExtract(query);
    case "cms":
      return runCmseek(query);
    case "social":
      return runSocialScan(query);

    default:
      throw new Error(`Type OSINT inconnu: ${type}`);
  }
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/** Vide le cache OSINT. */
export function clearOSINTCache(): void {
  cache.clear();
  logger.info("[OSINTProvider] Cache vidé");
}

/** Retourne les statistiques du cache et du rate limiter. */
export function getOSINTStats(): {
  cacheSize: number;
  activeQueries: number;
  queriesLastMinute: number;
  maxConcurrent: number;
  maxPerMinute: number;
  cacheTtlMs: number;
} {
  const now = Date.now();
  while (queryTimestamps.length > 0 && now - queryTimestamps[0] > 60_000) {
    queryTimestamps.shift();
  }
  return {
    cacheSize: cache.size,
    activeQueries,
    queriesLastMinute: queryTimestamps.length,
    maxConcurrent: MAX_CONCURRENT,
    maxPerMinute: MAX_PER_MINUTE,
    cacheTtlMs: CACHE_TTL_MS,
  };
}
