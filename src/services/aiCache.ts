import logger from "../utils/logger.js";
import crypto from "crypto";

/**
 * Service de cache pour les réponses IA
 * Réduit les appels API inutiles en mettant en cache les réponses similaires
 * Inclut une normalisation sémantique pour matcher les questions reformulées
 */

interface CachedResponse {
  response: string;
  timestamp: number;
  hitCount: number;
  normalizedQuery: string;
}

// Cache en mémoire (pourrait être remplacé par Redis pour la persistance distribuée)
const responseCache = new Map<string, CachedResponse>();

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min de TTL (plus frais)
const MAX_CACHE_SIZE = 200; // Augmenté pour plus de hits

/**
 * Normalise une question pour le cache sémantique:
 * - lowercase, trim, collapse whitespace
 * - remove punctuation
 * - remove stop words français/anglais
 * - remove accents
 */
function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[?!.,;:'"`~@#$%^&*()_+=\[\]{}|\\<>\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b(le|la|les|un|une|des|du|de|the|a|an|of|to|in|on|at|for|is|are|et|ou|mais|donc|or|ni|car|que|qui|quoi|comment|pourquoi|ou|quand|quel|quelle|quels|quelles|est|sont|ai|as|a|avons|avez|ont|vais|vas|va|allons|allez|vont)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Génère une clé de cache basée sur le message normalisé et le contexte
 */
function generateCacheKey(message: string, context?: string): string {
  const normalized = normalizeQuery(message);
  const data = context ? `${normalized}:${context}` : normalized;
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Récupère une réponse mise en cache
 */
export function getCachedResponse(message: string, context?: string): string | null {
  const key = generateCacheKey(message, context);
  const cached = responseCache.get(key);

  if (!cached) {
    return null;
  }

  // Vérifier si le cache a expiré
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    logger.debug(`[AICache] Cache expiré pour: ${message.slice(0, 30)}...`);
    return null;
  }

  // Incrémenter le compteur de hits
  cached.hitCount++;
  responseCache.set(key, cached);

  logger.info(`[AICache] 🎯 Cache hit pour: ${message.slice(0, 30)}... (hits: ${cached.hitCount})`);
  return cached.response;
}

/**
 * Met en cache une réponse IA
 * Ne cache que les réponses suffisamment longues (évite de cacher les erreurs courtes)
 */
export function cacheResponse(message: string, response: string, context?: string): void {
  // Ne pas cacher les réponses trop courtes (erreurs, clarifications)
  if (response.length < 20) return;
  // Ne pas cacher les messages d'erreur
  if (response.includes("Le serveur IA") || response.includes("Problème de communication")) return;
  // Ne pas cacher les questions de clarification (ambiguïté)
  if (response.startsWith("🤔")) return;

  const key = generateCacheKey(message, context);

  // Limiter la taille du cache
  if (responseCache.size >= MAX_CACHE_SIZE) {
    // Supprimer l'entrée la moins utilisée (LRU simple)
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [cacheKey, cached] of responseCache.entries()) {
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
        oldestKey = cacheKey;
      }
    }

    if (oldestKey) {
      responseCache.delete(oldestKey);
      logger.debug(`[AICache] Cache LRU: supprimé ${oldestKey}`);
    }
  }

  responseCache.set(key, {
    response,
    timestamp: Date.now(),
    hitCount: 0,
    normalizedQuery: normalizeQuery(message),
  });

  logger.debug(`[AICache] Réponse mise en cache: ${message.slice(0, 30)}...`);
}

/**
 * Efface le cache pour un message spécifique
 */
export function clearCacheEntry(message: string, context?: string): void {
  const key = generateCacheKey(message, context);
  responseCache.delete(key);
  logger.debug(`[AICache] Cache effacé pour: ${message.slice(0, 30)}...`);
}

/**
 * Efface tout le cache
 */
export function clearAllCache(): void {
  const size = responseCache.size;
  responseCache.clear();
  logger.info(`[AICache] Tout le cache effacé (${size} entrées)`);
}

/**
 * Récupère les statistiques du cache
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  hitRate: number;
  totalHits: number;
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  let totalHits = 0;
  let oldestTimestamp: number | null = null;
  let newestTimestamp: number | null = null;

  for (const cached of responseCache.values()) {
    totalHits += cached.hitCount;
    if (oldestTimestamp === null || cached.timestamp < oldestTimestamp) {
      oldestTimestamp = cached.timestamp;
    }
    if (newestTimestamp === null || cached.timestamp > newestTimestamp) {
      newestTimestamp = cached.timestamp;
    }
  }

  const hitRate = responseCache.size > 0 ? totalHits / (totalHits + responseCache.size) : 0;

  return {
    size: responseCache.size,
    maxSize: MAX_CACHE_SIZE,
    hitRate,
    totalHits,
    oldestEntry: oldestTimestamp,
    newestEntry: newestTimestamp,
  };
}

/**
 * Nettoie les entrées expirées du cache
 */
export function cleanupExpiredCache(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, cached] of responseCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL_MS) {
      responseCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`[AICache] Nettoyage de ${cleaned} entrée(s) expirée(s)`);
  }
}

// Nettoyage automatique toutes les 15 minutes
const _aiCacheCleanup = setInterval(cleanupExpiredCache, 15 * 60 * 1000);
if (_aiCacheCleanup.unref) _aiCacheCleanup.unref();
