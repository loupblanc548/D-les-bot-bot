/**
 * DeduplicationCache.ts — Cache anti-doublon PERSISTANT multi-plateforme
 *
 * Barrière ABSOLUE avant envoi Discord.
 * Stocke les IDs uniques des notifications déjà envoyées dans Neon (PostgreSQL).
 * Cache mémoire hybride pour des lookups ultra-rapides.
 * Persiste entre les redémarrages. Limité à 100 IDs par plateforme.
 */

import { prisma } from "../prisma.js";
import logger from "./logger.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PlatformKey =
  | "steam"
  | "epic"
  | "playstation"
  | "xbox"
  | "nintendo"
  | "fortnite"
  | "instantgaming"
  | "twitter"
  | "deals"
  | "free_games"
  | "patch_notes"
  | "game_updates"
  | "blogs"
  | "tiktok"
  | "kick"
  | "vods"
  | "clips"
  | "scheduled"
  | "tickets"
  | "onboarding"
  | "reaction_roles"
  | "polls"
  | "faq";

// ─── Constantes ─────────────────────────────────────────────────────────────

const MAX_IDS_PER_PLATFORM = 1000;
const ALL_PLATFORMS: PlatformKey[] = [
  "steam",
  "epic",
  "playstation",
  "xbox",
  "nintendo",
  "fortnite",
  "instantgaming",
  "twitter",
  "deals",
  "free_games",
  "patch_notes",
  "game_updates",
  "blogs",
  "tiktok",
  "kick",
  "vods",
  "clips",
  "scheduled",
  "tickets",
  "onboarding",
  "reaction_roles",
  "polls",
  "faq",
];

// ─── Cache Singleton ────────────────────────────────────────────────────────

class DeduplicationCache {
  private static instance: DeduplicationCache;
  /** Cache mémoire pour lookups synchrones ultra-rapides */
  private memoryCache = new Map<string, Set<string>>();
  private initialized = false;
  private lastMaintenance: string | null = null;
  private constructor() {}

  static getInstance(): DeduplicationCache {
    if (!DeduplicationCache.instance) {
      DeduplicationCache.instance = new DeduplicationCache();
    }
    return DeduplicationCache.instance;
  }

  // ─── Chargement depuis Neon (logique partagée) ────────────────────────────

  private async loadFromDatabase(): Promise<void> {
    const entries = await prisma.processedCache.findMany({
      select: { platform: true, uniqueId: true },
      orderBy: { createdAt: "desc" },
      take: MAX_IDS_PER_PLATFORM * ALL_PLATFORMS.length,
    });
    this.memoryCache.clear();
    for (const entry of entries) {
      if (!this.memoryCache.has(entry.platform)) {
        this.memoryCache.set(entry.platform, new Set());
      }
      const set = this.memoryCache.get(entry.platform)!;
      if (set.size < MAX_IDS_PER_PLATFORM) {
        set.add(entry.uniqueId);
      }
    }
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.loadFromDatabase();
      logger.info(`[DedupCache] Chargé depuis Neon (${this.getTotalCount()} IDs en mémoire)`);

      // Charge _lastMaintenance depuis AppState
      try {
        const state = await prisma.appState.findUnique({
          where: { key: "lastMaintenance" },
        });
        if (state) this.lastMaintenance = state.value;
      } catch {
        // Table AppState peut ne pas encore exister
      }
      this.initialized = true;
    } catch (error) {
      logger.error(
        "[DedupCache] Erreur chargement cache Neon: " +
          (error instanceof Error ? error.message : String(error)),
      );
      this.memoryCache.clear();
      // Ne pas marquer comme initialisé pour permettre une ré-initialisation
    }
  }

  // ─── Rechargement ─────────────────────────────────────────────────────────

  /** Recharge le cache depuis Neon — à appeler au début de chaque cycle cron */
  async reloadFromDisk(): Promise<void> {
    try {
      await this.loadFromDatabase();
    } catch (error) {
      logger.error(
        "[DedupCache] Erreur rechargement Neon: " +
          (error instanceof Error ? error.message : String(error)),
      );
      this.memoryCache.clear();
    }
  }

  // ─── Vérification (synchrone — cache mémoire) ─────────────────────────────

  isAlreadyProcessed(platform: PlatformKey, uniqueId: string): boolean {
    return this.memoryCache.get(platform)?.has(uniqueId) ?? false;
  }

  // ─── Marquage ─────────────────────────────────────────────────────────────

  async markAsProcessed(platform: PlatformKey, uniqueId: string): Promise<void> {
    // Mémoire
    if (!this.memoryCache.has(platform)) {
      this.memoryCache.set(platform, new Set());
    }
    const set = this.memoryCache.get(platform)!;
    if (set.has(uniqueId)) return;
    set.add(uniqueId);
    if (set.size > MAX_IDS_PER_PLATFORM) {
      const arr = [...set];
      this.memoryCache.set(platform, new Set(arr.slice(arr.length - MAX_IDS_PER_PLATFORM)));
    }
    // Persistance Neon (ignore doublons)
    try {
      await prisma.processedCache.create({
        data: { platform, uniqueId },
      });
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code !== "P2002") {
        logger.error("[DedupCache] Erreur DB markAsProcessed: " + (err?.message || String(error)));
      }
    }
  }

  async markBatch(platform: PlatformKey, ids: string[]): Promise<void> {
    if (!this.memoryCache.has(platform)) {
      this.memoryCache.set(platform, new Set());
    }
    const set = this.memoryCache.get(platform)!;
    const newIds = ids.filter((id) => !set.has(id));
    if (newIds.length === 0) return;
    for (const id of newIds) set.add(id);
    if (set.size > MAX_IDS_PER_PLATFORM) {
      const arr = [...set];
      this.memoryCache.set(platform, new Set(arr.slice(arr.length - MAX_IDS_PER_PLATFORM)));
    }
    // Persistance Neon (ignore doublons)
    try {
      await prisma.processedCache.createMany({
        data: newIds.map((uniqueId) => ({ platform, uniqueId })),
        skipDuplicates: true,
      });
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code !== "P2002") {
        logger.error("[DedupCache] Erreur DB markBatch: " + (err?.message || String(error)));
      }
    }
  }

  // ─── Warm-up ──────────────────────────────────────────────────────────────

  async warmUp(platform: PlatformKey, currentIds: string[]): Promise<void> {
    const deduped = [...new Set(currentIds)];
    logger.info(`[DedupCache] Warm-up ${platform}: ${deduped.length} IDs sans envoi`);
    await this.markBatch(platform, deduped);
  }

  async warmUpFromDatabase(getIds: (platform: PlatformKey) => Promise<string[]>): Promise<void> {
    for (const platform of ALL_PLATFORMS) {
      try {
        const ids = await getIds(platform);
        if (ids.length > 0) await this.warmUp(platform, ids);
      } catch (error) {
        logger.debug(
          "[DedupCache] Warm-up Neon ignoré pour " +
            platform +
            ": " +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
  }

  // ─── Utilitaires ──────────────────────────────────────────────────────────

  getTotalCount(): number {
    let total = 0;
    for (const set of this.memoryCache.values()) total += set.size;
    return total;
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const p of ALL_PLATFORMS) stats[p] = this.memoryCache.get(p)?.size || 0;
    return stats;
  }

  /** Supprime les IDs trop anciens (conserve les 100 plus récents par plateforme). */
  async clean(): Promise<void> {
    await Promise.all(
      ALL_PLATFORMS.map(async (platform) => {
        const count = await prisma.processedCache.count({
          where: { platform },
        });
        if (count > MAX_IDS_PER_PLATFORM) {
          const excess = count - MAX_IDS_PER_PLATFORM;
          const oldestToDelete = await prisma.processedCache.findMany({
            where: { platform },
            orderBy: { createdAt: "asc" },
            take: excess,
            select: { id: true },
          });
          if (oldestToDelete.length > 0) {
            await prisma.processedCache.deleteMany({
              where: { id: { in: oldestToDelete.map((e) => e.id) } },
            });
          }
        }
      }),
    );
    // Recharge le cache mémoire
    await this.reloadFromDisk();
    logger.info("[DedupCache] Nettoyage Neon terminé");
  }

  /** Réinitialise le
 cache mémoire + DB mais préserve _lastMaintenance. */
  async reset(): Promise<void> {
    await prisma.processedCache.deleteMany({});
    this.memoryCache.clear();
    logger.info("[DedupCache] Cache Neon réinitialisé");
  }

  /** Vide uniquement le cache mémoire (urgence mémoire — sans toucher la DB). */
  clearMemory(): void {
    const total = [...this.memoryCache.values()].reduce((sum, s) => sum + s.size, 0);
    this.memoryCache.clear();
    logger.info(`[DedupCache] Cache mémoire vidé (${total} IDs libérés)`);
  }

  /**
   * Vérifie si nous sommes le 15 du mois (pour la maintenance).
   * Compare avec le dernier nettoyage stocké dans AppState.
   */
  async isMaintenanceDay(): Promise<boolean> {
    const now = new Date();
    if (now.getDate() !== 15) return false;
    try {
      const state = await prisma.appState.findUnique({
        where: { key: "lastMaintenance" },
      });
      this.lastMaintenance = state?.value ?? null;
    } catch {
      // Table potentiellement inexistante
    }
    if (this.lastMaintenance) {
      const lastDate = new Date(this.lastMaintenance);
      if (lastDate.getMonth() === now.getMonth() && lastDate.getFullYear() === now.getFullYear()) {
        return false;
      }
    }
    return true;
  }

  async markMaintenanceDone(): Promise<void> {
    const now = new Date().toISOString();
    this.lastMaintenance = now;
    try {
      await prisma.appState.upsert({
        where: { key: "lastMaintenance" },
        create: { key: "lastMaintenance", value: now },
        update: { value: now },
      });
    } catch (error) {
      logger.error(
        "[DedupCache] Erreur markMaintenanceDone: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}

export const dedupCache = DeduplicationCache.getInstance();
export default DeduplicationCache;
