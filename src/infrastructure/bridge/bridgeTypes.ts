/**
 * bridgeTypes.ts — Shared types for the Hybrid Master/Worker Bridge
 *
 * Used by both the Master VPS (bridge server) and the Local PC Worker (bridge client).
 * All messages are JSON-serializable for WebSocket transport.
 */

// ─── Connection & Auth ───────────────────────────────────────────────────────

export interface BridgeAuthChallenge {
  type: "auth_challenge";
  nonce: string;
  timestamp: number;
}

export interface BridgeAuthResponse {
  type: "auth_response";
  token: string;
  workerId: string;
  capabilities: string[];
}

export interface BridgeAuthResult {
  type: "auth_result";
  success: boolean;
  message: string;
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────

export interface BridgePing {
  type: "ping";
  timestamp: number;
}

export interface BridgePong {
  type: "pong";
  timestamp: number;
  workerLoad: number; // 0.0 to 1.0
  workerHeapMB: number;
}

// ─── Job Protocol (RPC) ──────────────────────────────────────────────────────

export type JobStatus = "pending" | "running" | "success" | "failed" | "timeout";

export interface BridgeJobRequest {
  type: "job_request";
  jobId: string;
  command: string;
  subcommand?: string;
  payload: {
    options: Record<string, unknown>;
    userId: string;
    guildId: string;
    channelId: string;
    username: string;
    locale: string;
  };
  timeoutMs: number;
  createdAt: number;
}

export interface BridgeJobResult {
  type: "job_result";
  jobId: string;
  status: "success" | "failed" | "timeout";
  data: {
    textResult?: string;
    embedsPayload?: unknown[];
    content?: string;
  };
  error?: string;
  executionMs: number;
  workerId: string;
}

export interface BridgeJobProgress {
  type: "job_progress";
  jobId: string;
  message: string;
  percent: number;
}

// ─── Worker Status ───────────────────────────────────────────────────────────

export interface BridgeWorkerStatus {
  type: "worker_status";
  workerId: string;
  online: boolean;
  heapMB: number;
  load: number;
  uptime: number;
  jobsCompleted: number;
  jobsFailed: number;
}

// ─── Union type for all bridge messages ──────────────────────────────────────

export type BridgeMessage =
  | BridgeAuthChallenge
  | BridgeAuthResponse
  | BridgeAuthResult
  | BridgePing
  | BridgePong
  | BridgeJobRequest
  | BridgeJobResult
  | BridgeJobProgress
  | BridgeWorkerStatus;

// ─── Offload Decision ────────────────────────────────────────────────────────

export type ExecutionTarget = "local" | "remote" | "local_degraded";

export interface OffloadDecision {
  target: ExecutionTarget;
  reason: string;
  heapGB: number;
  workerOnline: boolean;
  timestamp: number;
}

// ─── Commands eligible for offloading ────────────────────────────────────────

export const OFFLOADABLE_COMMANDS = [
  "ai",
  "admin",
  "scan",
  "purge",
  "backup",
  "compile",
  "analyze",
  "investigate",
] as const;

export type OffloadableCommand = (typeof OFFLOADABLE_COMMANDS)[number];

export function isOffloadableCommand(command: string): boolean {
  return (OFFLOADABLE_COMMANDS as readonly string[]).includes(command);
}
