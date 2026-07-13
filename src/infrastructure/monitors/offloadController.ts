/**
 * offloadController.ts — Dynamic Memory Offload Controller
 *
 * Monitors Master VPS memory and decides whether to execute locally
 * or offload to the Local PC Worker.
 *
 * Routing Logic:
 *   < 3.5GB heap → local execution
 *   > 3.5GB heap + worker online → remote offload
 *   > 3.5GB heap + worker offline → local degraded (gc + reduced agent steps)
 */

import logger from "../../utils/logger.js";
import { isWorkerOnline } from "../bridge/bridgeServer.js";
import type { OffloadDecision, ExecutionTarget } from "../bridge/bridgeTypes.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const OFFLOAD_THRESHOLD_GB = 3.5;
const DEGRADED_AGENT_STEPS = 3;
const BYTES_PER_GB = 1024 * 1024 * 1024;

// ─── Stats ───────────────────────────────────────────────────────────────────

let totalLocalExecutions = 0;
let totalRemoteExecutions = 0;
let totalDegradedExecutions = 0;

export interface OffloadStats {
  totalLocal: number;
  totalRemote: number;
  totalDegraded: number;
  currentHeapGB: number;
  workerOnline: boolean;
  thresholdGB: number;
}

export function getOffloadStats(): OffloadStats {
  const heapGB = process.memoryUsage().heapUsed / BYTES_PER_GB;
  return {
    totalLocal: totalLocalExecutions,
    totalRemote: totalRemoteExecutions,
    totalDegraded: totalDegradedExecutions,
    currentHeapGB: Math.round(heapGB * 100) / 100,
    workerOnline: isWorkerOnline(),
    thresholdGB: OFFLOAD_THRESHOLD_GB,
  };
}

// ─── Core Decision Logic ─────────────────────────────────────────────────────

/**
 * Evaluate current memory pressure and decide where to execute a command.
 */
export function evaluateOffload(): OffloadDecision {
  const heapUsed = process.memoryUsage().heapUsed;
  const heapGB = heapUsed / BYTES_PER_GB;
  const workerOnline = isWorkerOnline();
  const now = Date.now();

  if (heapGB < OFFLOAD_THRESHOLD_GB) {
    return {
      target: "local",
      reason: `Heap ${heapGB.toFixed(2)}GB < threshold ${OFFLOAD_THRESHOLD_GB}GB`,
      heapGB,
      workerOnline,
      timestamp: now,
    };
  }

  // High stress — try to offload
  if (workerOnline) {
    return {
      target: "remote",
      reason: `Heap ${heapGB.toFixed(2)}GB >= ${OFFLOAD_THRESHOLD_GB}GB, worker online → offloading`,
      heapGB,
      workerOnline,
      timestamp: now,
    };
  }

  // High stress but no worker — degraded mode
  return {
    target: "local_degraded",
    reason: `Heap ${heapGB.toFixed(2)}GB >= ${OFFLOAD_THRESHOLD_GB}GB, worker offline → degraded mode`,
    heapGB,
    workerOnline,
    timestamp: now,
  };
}

/**
 * Record an execution decision for stats tracking.
 */
export function recordExecution(target: ExecutionTarget): void {
  switch (target) {
    case "local":
      totalLocalExecutions++;
      break;
    case "remote":
      totalRemoteExecutions++;
      break;
    case "local_degraded":
      totalDegradedExecutions++;
      // Trigger GC in degraded mode
      if (global.gc) {
        try {
          global.gc();
          logger.info("[OffloadController] Triggered global.gc() in degraded mode");
        } catch {
          // gc not available
        }
      }
      break;
  }
}

/**
 * Returns the max agent loop iterations based on current mode.
 * Degraded mode reduces from 5 to 3 to save memory.
 */
export function getMaxAgentSteps(): number {
  const decision = evaluateOffload();
  if (decision.target === "local_degraded") {
    return DEGRADED_AGENT_STEPS;
  }
  return 5; // Default — matches MAX_ITERATIONS in agentLoop.ts
}

/**
 * Check if a command should be offloaded based on memory + worker availability.
 * Returns true if the command should be sent to the remote worker.
 */
export function shouldOffload(_command: string): boolean {
  const decision = evaluateOffload();
  return decision.target === "remote";
}
