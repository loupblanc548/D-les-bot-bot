/**
 * circuitBreaker.ts — Circuit breaker léger pour APIs externes
 *
 * Protège contre les pannes en cascade en ouvrant le circuit
 * après N échecs consécutifs, puis en le fermant après un délai.
 *
 * États: CLOSED (normal) → OPEN (bloque) → HALF_OPEN (test) → CLOSED/OPEN
 *
 * Note: services/circuitBreaker.ts est une implémentation plus complète
 * avec métriques Prometheus, fallback, et intégration agentLoop.
 * Ce module est destiné aux utilitaires simples (healthCheck, webhook).
 */

import logger from "./logger.js";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  /** Nombre d'échecs consécutifs avant ouverture */
  failureThreshold?: number;
  /** Délai avant passage en half-open (ms) */
  resetTimeoutMs?: number;
  /** Seuil de réussites en half-open avant fermeture */
  successThreshold?: number;
  /** Nom du circuit pour logging */
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly name: string;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.successThreshold = opts.successThreshold ?? 2;
    this.name = opts.name ?? "default";
  }

  /** Exécute fn si le circuit le permet, sinon lève CircuitOpenError */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "half-open";
        this.successCount = 0;
        logger.info(`[CircuitBreaker:${this.name}] Transition open → half-open`);
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** Vérifie si le circuit est ouvert sans exécuter */
  isOpen(): boolean {
    return this.state === "open";
  }

  getState(): CircuitState {
    return this.state;
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = "closed";
        this.failureCount = 0;
        logger.info(`[CircuitBreaker:${this.name}] Transition half-open → closed`);
      }
    } else if (this.state === "closed") {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      this.state = "open";
      logger.warn(`[CircuitBreaker:${this.name}] half-open → open (failure during probe)`);
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = "open";
      logger.warn(
        `[CircuitBreaker:${this.name}] closed → open (${this.failureCount} consecutive failures)`,
      );
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(circuitName: string) {
    super(`Circuit "${circuitName}" is open — requests blocked`);
    this.name = "CircuitOpenError";
  }
}

/** Factory: registre global de circuits par nom */
const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, opts?: CircuitBreakerOptions): CircuitBreaker {
  let cb = registry.get(name);
  if (!cb) {
    cb = new CircuitBreaker({ ...opts, name });
    registry.set(name, cb);
  }
  return cb;
}
