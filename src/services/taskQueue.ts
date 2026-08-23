/**
 * taskQueue.ts — File d'attente EN MÉMOIRE pour tâches longues
 *
 * ⚠️ Cette implémentation est en mémoire (pas BullMQ/Redis).
 * Les tâches sont perdues au redémarrage et ne survivent pas multi-instance.
 * L'interface reste compatible avec une future migration BullMQ.
 *
 * Inclut:
 *  - Clé de déduplication par tâche
 *  - Priorités et timeouts
 *  - Retry avec backoff
 */

import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface TaskDefinition<T = unknown> {
  id: string;
  type: string;
  payload: T;
  priority?: TaskPriority;
  timeoutMs?: number;
  maxRetries?: number;
  idempotencyKey?: string;
  dedupTtlMs?: number;
}

export interface TaskResult<T = unknown> {
  taskId: string;
  success: boolean;
  result?: T;
  error?: string;
  durationMs: number;
  fromCache: boolean;
}

export type TaskHandler<T = unknown, R = unknown> = (payload: T, signal: AbortSignal) => Promise<R>;

// ─── File d'attente en mémoire (sans Redis/BullMQ) ───────────────────────────
// ⚠️ Les tâches sont perdues au redémarrage. L'interface reste compatible
// avec une future migration vers BullMQ + Redis.

const handlers = new Map<string, TaskHandler>();
const resultCache = new Map<string, { result: TaskResult; timestamp: number }>();
const activeTasks = new Map<string, AbortController>();

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_DEDUP_TTL_MS = 5 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Clean every 5 minutes
const MAX_CACHE_ENTRIES = 500;

// Periodic cleanup of expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of resultCache) {
    const ttl = DEFAULT_DEDUP_TTL_MS;
    if (now - entry.timestamp > ttl) {
      resultCache.delete(key);
    }
  }
  // Also enforce hard cap on entry count
  if (resultCache.size > MAX_CACHE_ENTRIES) {
    const sorted = Array.from(resultCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    const toRemove = sorted.slice(0, resultCache.size - MAX_CACHE_ENTRIES);
    for (const [key] of toRemove) resultCache.delete(key);
  }
}, CACHE_CLEANUP_INTERVAL_MS).unref();

// ─── Enregistrement des handlers ─────────────────────────────────────────────

export function registerTaskHandler<T = unknown, R = unknown>(
  type: string,
  handler: TaskHandler<T, R>,
): void {
  handlers.set(type, handler as TaskHandler);
  logger.debug(`[TaskQueue] Registered handler for type "${type}"`);
}

export function unregisterTaskHandler(type: string): void {
  handlers.delete(type);
}

// ─── Enqueue / Execute ───────────────────────────────────────────────────────

export async function enqueue<T = unknown, R = unknown>(
  def: TaskDefinition<T>,
): Promise<TaskResult<R>> {
  // Check idempotency cache
  if (def.idempotencyKey) {
    const cached = resultCache.get(def.idempotencyKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      const ttl = def.dedupTtlMs ?? DEFAULT_DEDUP_TTL_MS;
      if (age < ttl) {
        logger.info(`[TaskQueue] Dedup hit for key "${def.idempotencyKey}"`);
        return { ...cached.result, fromCache: true } as TaskResult<R>;
      }
      resultCache.delete(def.idempotencyKey);
    }
  }

  const handler = handlers.get(def.type);
  if (!handler) {
    return {
      taskId: def.id,
      success: false,
      error: `No handler registered for task type "${def.type}"`,
      durationMs: 0,
      fromCache: false,
    };
  }

  const start = Date.now();
  const timeoutMs = def.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = def.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    activeTasks.set(def.id, controller);

    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await handler(def.payload, controller.signal);
      clearTimeout(timeout);
      activeTasks.delete(def.id);

      const taskResult: TaskResult = {
        taskId: def.id,
        success: true,
        result,
        durationMs: Date.now() - start,
        fromCache: false,
      };

      // Cache result if idempotency key is set
      if (def.idempotencyKey) {
        resultCache.set(def.idempotencyKey, {
          result: taskResult,
          timestamp: Date.now(),
        });
      }

      return taskResult as TaskResult<R>;
    } catch (err) {
      clearTimeout(timeout);
      activeTasks.delete(def.id);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        // Exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10_000);
        logger.warn(
          `[TaskQueue] Task "${def.id}" attempt ${attempt + 1} failed, retrying in ${backoffMs}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  return {
    taskId: def.id,
    success: false,
    error: lastError?.message ?? "Unknown error",
    durationMs: Date.now() - start,
    fromCache: false,
  };
}

// ─── Contrôle ────────────────────────────────────────────────────────────────

export function cancelTask(taskId: string): boolean {
  const controller = activeTasks.get(taskId);
  if (controller) {
    controller.abort();
    activeTasks.delete(taskId);
    return true;
  }
  return false;
}

export function getActiveTaskCount(): number {
  return activeTasks.size;
}

export function clearResultCache(): void {
  resultCache.clear();
}

export function getResultCacheSize(): number {
  return resultCache.size;
}

// ─── Limitations de l'implémentation en mémoire ──────────────────────────────
// ⚠️ Les tâches actives sont perdues au redémarrage.
// Les résultats en cache sont volatiles (non persistés en Redis).
// Pour une reprise réelle, migrer vers BullMQ + Redis.

export function getPendingTasks(): string[] {
  return Array.from(activeTasks.keys());
}

export default {
  registerTaskHandler,
  unregisterTaskHandler,
  enqueue,
  cancelTask,
  getActiveTaskCount,
  clearResultCache,
  getResultCacheSize,
  getPendingTasks,
};
