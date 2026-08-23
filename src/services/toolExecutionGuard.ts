/**
 * toolExecutionGuard.ts — Source centrale pour les permissions, audit et dry-run
 *
 * Unifie:
 *  - RESTRICTED_TOOLS (agentToolRouter.ts)
 *  - TOOL_RISK_REGISTRY (toolRiskRegistry.ts)
 *  - Vérification d'autorisation avant exécution
 *  - Journal d'audit pour toute action modifiant Discord/DB/système
 *  - Mode dry-run pour tests
 */

import logger from "../utils/logger.js";
import { RESTRICTED_TOOLS } from "./agentToolRouter.js";
import { requiresApproval, getRiskLevel } from "./toolRiskRegistry.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ToolPermission {
  toolName: string;
  riskLevel: RiskLevel;
  restricted: boolean;
  requiresApproval: boolean;
  allowedChannels: "all" | "private" | "whitelist";
  requiresDryRun: boolean;
  idempotencyRequired: boolean;
}

export interface AuditEntry {
  timestamp: number;
  toolName: string;
  userId: string;
  guildId: string;
  riskLevel: RiskLevel;
  approved: boolean;
  dryRun: boolean;
  result: "success" | "failure" | "denied" | "dry-run";
  durationMs: number;
  error?: string;
}

// ─── Outils classifiés séparément (Kali, External) ───────────────────────────

const KALI_TOOLS = new Set<string>([
  "nmap_scan",
  "nikto_scan",
  "sqlmap_scan",
  "metasploit_exploit",
  "hydra_brute",
  "john_crack",
  "hashcat_crack",
  "aircrack_ng",
  "wifite_attack",
  "recon_ng",
  "maltego_transform",
  "theharvester",
  "shodan_search",
  "censys_search",
  "zoomeye_search",
]);

const EXTERNAL_TOOLS = new Set<string>([
  "http_request",
  "curl_request",
  "wget_download",
  "dns_lookup",
  "whois_lookup",
  "ssl_scan",
  "port_scan",
  "subdomain_enum",
]);

// Outils qui modifient Discord/DB/système → audit obligatoire
const MUTATING_TOOLS = new Set<string>([
  "send_message",
  "edit_message",
  "delete_message",
  "kick_user",
  "ban_user",
  "mute_user",
  "warn_user",
  "create_channel",
  "delete_channel",
  "create_role",
  "delete_role",
  "db_query",
  "db_insert",
  "db_update",
  "db_delete",
  "ssh_command",
  "docker_manage",
  "file_write",
  "file_delete",
  "create_ticket",
  "close_ticket",
]);

// Outils nécessitant un dry-run avant exécution réelle
const DRY_RUN_REQUIRED = new Set<string>([
  "ban_user",
  "kick_user",
  "docker_manage",
  "ssh_command",
  "db_delete",
  "file_delete",
  "db_update",
]);

// ─── Source centrale de permissions ──────────────────────────────────────────

export function getToolPermission(toolName: string): ToolPermission {
  const risk = getRiskLevel(toolName) as RiskLevel;
  const restricted = RESTRICTED_TOOLS.has(toolName);
  const needsApproval = requiresApproval(toolName);
  const isMutating = MUTATING_TOOLS.has(toolName);
  const isKali = KALI_TOOLS.has(toolName);
  const isExternal = EXTERNAL_TOOLS.has(toolName);

  return {
    toolName,
    riskLevel: risk,
    restricted,
    requiresApproval: needsApproval,
    allowedChannels: restricted ? "private" : "all",
    requiresDryRun: DRY_RUN_REQUIRED.has(toolName),
    idempotencyRequired: isMutating,
  };
}

// ─── Vérification d'autorisation avant exécution ─────────────────────────────

export interface AuthorizationContext {
  toolName: string;
  userId: string;
  guildId: string;
  isPublicChannel: boolean;
  hasApproval?: boolean;
  dryRun?: boolean;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  permission: ToolPermission;
  requiresDryRunFirst: boolean;
}

export function checkAuthorization(ctx: AuthorizationContext): AuthorizationResult {
  const perm = getToolPermission(ctx.toolName);

  // 1. Context guard: restricted tools in public channels
  if (perm.restricted && ctx.isPublicChannel) {
    return {
      allowed: false,
      reason: `Tool "${ctx.toolName}" is restricted to private channels only`,
      permission: perm,
      requiresDryRunFirst: false,
    };
  }

  // 2. Kali tools always require approval
  if (KALI_TOOLS.has(ctx.toolName) && !ctx.hasApproval) {
    return {
      allowed: false,
      reason: `Kali tool "${ctx.toolName}" requires explicit approval`,
      permission: perm,
      requiresDryRunFirst: false,
    };
  }

  // 3. External tools require approval in production
  if (EXTERNAL_TOOLS.has(ctx.toolName) && !ctx.hasApproval && perm.riskLevel !== "low") {
    return {
      allowed: false,
      reason: `External tool "${ctx.toolName}" requires approval (risk: ${perm.riskLevel})`,
      permission: perm,
      requiresDryRunFirst: false,
    };
  }

  // 4. High/critical risk tools require approval
  if ((perm.riskLevel === "high" || perm.riskLevel === "critical") && !ctx.hasApproval) {
    return {
      allowed: false,
      reason: `Tool "${ctx.toolName}" is ${perm.riskLevel} risk and requires approval`,
      permission: perm,
      requiresDryRunFirst: perm.requiresDryRun,
    };
  }

  // 5. Dry-run required for certain tools
  if (perm.requiresDryRun && !ctx.dryRun) {
    return {
      allowed: true,
      reason: `Tool "${ctx.toolName}" should be dry-run first`,
      permission: perm,
      requiresDryRunFirst: true,
    };
  }

  return {
    allowed: true,
    reason: "Authorized",
    permission: perm,
    requiresDryRunFirst: false,
  };
}

// ─── Journal d'audit ─────────────────────────────────────────────────────────

const auditLog: AuditEntry[] = [];
const MAX_AUDIT_LOG = 5_000;

export function recordAuditEntry(entry: AuditEntry): void {
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_LOG) {
    auditLog.shift();
  }

  // Log immédiatement pour les outils mutants
  if (MUTATING_TOOLS.has(entry.toolName)) {
    logger.info(
      `[Audit] ${entry.toolName} by ${entry.userId} in ${entry.guildId} → ${entry.result} (${entry.durationMs}ms)${entry.error ? ` error: ${entry.error}` : ""}`,
    );
  }
}

export function getAuditLog(filter?: {
  toolName?: string;
  userId?: string;
  guildId?: string;
  since?: number;
}): AuditEntry[] {
  let records = auditLog;
  if (filter?.toolName) records = records.filter((r) => r.toolName === filter.toolName);
  if (filter?.userId) records = records.filter((r) => r.userId === filter.userId);
  if (filter?.guildId) records = records.filter((r) => r.guildId === filter.guildId);
  if (filter?.since) records = records.filter((r) => r.timestamp >= filter.since!);
  return records;
}

export function getAuditStats(): {
  totalExecutions: number;
  denied: number;
  dryRuns: number;
  failures: number;
  byRiskLevel: Record<string, number>;
} {
  const byRiskLevel: Record<string, number> = {};
  let denied = 0;
  let dryRuns = 0;
  let failures = 0;

  for (const entry of auditLog) {
    byRiskLevel[entry.riskLevel] = (byRiskLevel[entry.riskLevel] || 0) + 1;
    if (entry.result === "denied") denied++;
    if (entry.result === "dry-run") dryRuns++;
    if (entry.result === "failure") failures++;
  }

  return {
    totalExecutions: auditLog.length,
    denied,
    dryRuns,
    failures,
    byRiskLevel,
  };
}

// ─── Clé d'idempotence ───────────────────────────────────────────────────────

const idempotencyKeys = new Map<string, { result: string; timestamp: number }>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function checkIdempotency(key: string): { result: string | null; isRecent: boolean } {
  const existing = idempotencyKeys.get(key);
  if (!existing) return { result: null, isRecent: false };

  const age = Date.now() - existing.timestamp;
  if (age > IDEMPOTENCY_TTL_MS) {
    idempotencyKeys.delete(key);
    return { result: null, isRecent: false };
  }

  return { result: existing.result, isRecent: true };
}

export function recordIdempotency(key: string, result: string): void {
  idempotencyKeys.set(key, { result, timestamp: Date.now() });
}

export function generateIdempotencyKey(
  toolName: string,
  userId: string,
  args: Record<string, unknown>,
): string {
  const argsHash = JSON.stringify(args, Object.keys(args).sort());
  return `${toolName}:${userId}:${argsHash}`;
}

export default {
  getToolPermission,
  checkAuthorization,
  recordAuditEntry,
  getAuditLog,
  getAuditStats,
  checkIdempotency,
  recordIdempotency,
  generateIdempotencyKey,
};
