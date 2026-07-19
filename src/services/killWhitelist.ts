/**
 * killWhitelist.ts — Module 7: Centralized Audit Target Whitelist
 *
 * IMMUTABLE SECURITY BOUNDARY for all Kali Linux audit tools.
 * Every tool in the defensive audit suite MUST call assertTargetInWhitelist()
 * before any Docker exec. No bypass is possible by design.
 *
 * Configuration is exclusively via environment variables — never mutable
 * at runtime, never overridable by Discord commands or the agent itself.
 *
 * Env vars (set in .env on the VPS):
 *  - AUDIT_ALLOWED_CIDRS  : comma-separated CIDR ranges (e.g. "192.168.1.0/24,10.0.0.0/8")
 *  - AUDIT_ALLOWED_SSID   : comma-separated WiFi SSIDs (e.g. "MyHomeWiFi,GuestNet")
 *  - MY_VPS_IP / VPS_IP   : public VPS IP address
 *  - ADMIN_DISCORD_ID     : for violation notifications
 *
 * Security guarantees:
 *  1. IP normalization defeats encoding tricks (decimal, hex, octal, IPv6-mapped)
 *  2. DNS resolution is NOT trusted — only IP/CIDR matching is authoritative
 *  3. SSID matching is case-sensitive exact match only (no wildcards)
 *  4. All violations are logged + admin notified via Discord DM
 *  5. The whitelist is frozen at module load — no runtime mutation API exists
 */

import { exec } from "child_process";
import { promisify } from "util";
import { Client } from "discord.js";
import logger from "../utils/logger.js";

const execAsync = promisify(exec);

const PURPLE = "\x1b[35m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ─── Frozen Whitelist Configuration ──────────────────────────────────────────

const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID ?? "";
const VPS_IP = process.env.MY_VPS_IP ?? process.env.VPS_IP ?? "";

/**
 * Parse AUDIT_ALLOWED_CIDRS env var into a frozen list of CIDR strings.
 * Always includes localhost and the VPS IP.
 */
function buildCidrWhitelist(): readonly string[] {
  const envCidrs = process.env.AUDIT_ALLOWED_CIDRS ?? "";
  const cidrs: string[] = [];

  for (const raw of envCidrs.split(",")) {
    const trimmed = raw.trim();
    if (trimmed) cidrs.push(trimmed);
  }

  // Always allow localhost
  cidrs.push("127.0.0.0/8");
  cidrs.push("::1/128");

  // Always allow VPS public IP
  if (VPS_IP) cidrs.push(VPS_IP);

  // Deduplicate
  return Object.freeze([...new Set(cidrs)]);
}

/**
 * Parse AUDIT_ALLOWED_SSID env var into a frozen set of WiFi SSIDs.
 */
function buildSsidWhitelist(): ReadonlySet<string> {
  const envSsids = process.env.AUDIT_ALLOWED_SSID ?? "";
  const ssids = new Set<string>();

  for (const raw of envSsids.split(",")) {
    const trimmed = raw.trim();
    if (trimmed) ssids.add(trimmed);
  }

  return Object.freeze(ssids) as ReadonlySet<string>;
}

const FROZEN_CIDRS = buildCidrWhitelist();
const FROZEN_SSIDS = buildSsidWhitelist();

// ─── IP Normalization & Validation ───────────────────────────────────────────

/**
 * Convert various IP encodings to a normalized dotted-decimal IPv4 string.
 * Handles: decimal integer, hexadecimal, octal, IPv6-mapped IPv4.
 * Returns null if the input is not a valid IP address.
 */
export function normalizeIp(input: string): string | null {
  const trimmed = input.trim();

  // IPv6-mapped IPv4: ::ffff:192.168.1.1
  const v6Mapped = trimmed.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (v6Mapped) return normalizeIpv4(v6Mapped[1]);

  // Pure IPv4 dotted decimal
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    return normalizeIpv4(trimmed);
  }

  // Decimal integer encoding (e.g. 3232235777 = 192.168.1.1)
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num >= 0 && num <= 0xffffffff) {
      const a = (num >>> 24) & 0xff;
      const b = (num >>> 16) & 0xff;
      const c = (num >>> 8) & 0xff;
      const d = num & 0xff;
      return `${a}.${b}.${c}.${d}`;
    }
  }

  // Hex encoding (e.g. 0xc0a80101)
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const num = parseInt(trimmed, 16);
    if (num >= 0 && num <= 0xffffffff) {
      const a = (num >>> 24) & 0xff;
      const b = (num >>> 16) & 0xff;
      const c = (num >>> 8) & 0xff;
      const d = num & 0xff;
      return `${a}.${b}.${c}.${d}`;
    }
  }

  // Octal encoding (e.g. 0300.0250.0001.0001)
  const octalParts = trimmed.split(".");
  if (octalParts.length === 4 && octalParts.every((p) => /^0\d+$/.test(p))) {
    const decimals = octalParts.map((p) => parseInt(p, 8));
    if (decimals.every((d) => d >= 0 && d <= 255)) {
      return decimals.join(".");
    }
  }

  return null;
}

function normalizeIpv4(dotted: string): string | null {
  const parts = dotted.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return nums.join(".");
}

/**
 * Check if an IPv4 address falls within a CIDR range.
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp) return false;

  // If CIDR is a single IP (no /prefix), do exact match
  if (!cidr.includes("/")) {
    const normalizedCidr = normalizeIp(cidr);
    return normalizedCidr !== null && normalizedIp === normalizedCidr;
  }

  const [base, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const baseIp = normalizeIp(base);
  if (!baseIp) return false;

  const ipInt = ipToInt(normalizedIp);
  const baseInt = ipToInt(baseIp);
  if (ipInt === null || baseInt === null) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

// ─── Public Validation API ───────────────────────────────────────────────────

let discordClient: Client | null = null;

export function setWhitelistClient(client: Client): void {
  discordClient = client;
}

export interface WhitelistViolation {
  target: string;
  tool: string;
  invokedBy: string;
  reason: string;
  timestamp: Date;
}

/**
 * Log a whitelist violation and notify admin via DM.
 */
async function logViolation(violation: WhitelistViolation): Promise<void> {
  logger.error(
    `${RED}${BOLD}[WHITELIST-VIOLATION]${RESET} ${RED}SECURITY VIOLATION: Tool "${violation.tool}" attempted to target "${violation.target}" — ${violation.reason}. Invoked by: ${violation.invokedBy}${RESET}`,
  );

  if (discordClient && ADMIN_DISCORD_ID) {
    try {
      const admin = await discordClient.users.fetch(ADMIN_DISCORD_ID);
      await admin.send(
        `🚨 **[WHITELIST VIOLATION]**\n` +
          `Tool: \`${violation.tool}\`\n` +
          `Target: \`${violation.target}\`\n` +
          `Reason: ${violation.reason}\n` +
          `Invoked by: <@${violation.invokedBy}>\n` +
          `Time: ${violation.timestamp.toISOString()}`,
      );
    } catch (err) {
      logger.error(
        `[WHITELIST] Failed to notify admin: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Assert that a network target (IP or hostname) is within the whitelist.
 * Throws a WhitelistViolationError if the target is not allowed.
 *
 * This function performs:
 *  1. IP normalization (defeats decimal/hex/octal/IPv6-mapped encoding tricks)
 *  2. CIDR matching against FROZEN_CIDRS
 *  3. Hostname resolution is NOT performed — only IP/CIDR matching is trusted
 *
 * @param target  IP address or hostname to validate
 * @param tool    Name of the tool requesting validation (for logging)
 * @param invokedBy  Discord user ID who triggered the audit
 */
export async function assertTargetInWhitelist(
  target: string,
  tool: string,
  invokedBy: string,
): Promise<void> {
  const trimmed = target.trim();
  if (!trimmed) {
    await logViolation({
      target: "(empty)",
      tool,
      invokedBy,
      reason: "Empty target provided",
      timestamp: new Date(),
    });
    throw new WhitelistViolationError("Empty target provided", target, tool);
  }

  // Attempt IP normalization first
  const normalizedIp = normalizeIp(trimmed);

  if (normalizedIp) {
    // It's an IP — check against CIDR whitelist
    for (const cidr of FROZEN_CIDRS) {
      if (ipInCidr(normalizedIp, cidr)) {
        return; // Allowed
      }
    }

    await logViolation({
      target: trimmed,
      tool,
      invokedBy,
      reason: `IP ${normalizedIp} not in any allowed CIDR: ${[...FROZEN_CIDRS].join(", ")}`,
      timestamp: new Date(),
    });
    throw new WhitelistViolationError(
      `IP ${normalizedIp} is not in the allowed audit whitelist`,
      trimmed,
      tool,
    );
  }

  // It's a hostname — check if it's "localhost"
  if (trimmed.toLowerCase() === "localhost") {
    return; // Allowed
  }

  // Hostname: we do NOT resolve DNS. Reject by default.
  // This prevents DNS rebinding attacks where a domain resolves to a non-whitelisted IP.
  await logViolation({
    target: trimmed,
    tool,
    invokedBy,
    reason: "Hostname targets are not allowed — only IP addresses and CIDR ranges in the whitelist",
    timestamp: new Date(),
  });
  throw new WhitelistViolationError(
    `Hostname "${trimmed}" is not allowed. Only whitelisted IP addresses and CIDR ranges are permitted.`,
    trimmed,
    tool,
  );
}

/**
 * Assert that a WiFi SSID is within the whitelist.
 * Case-sensitive exact match only.
 */
export async function assertSsidInWhitelist(
  ssid: string,
  tool: string,
  invokedBy: string,
): Promise<void> {
  const trimmed = ssid.trim();
  if (!trimmed) {
    await logViolation({
      target: "(empty SSID)",
      tool,
      invokedBy,
      reason: "Empty SSID provided",
      timestamp: new Date(),
    });
    throw new WhitelistViolationError("Empty SSID provided", ssid, tool);
  }

  if (FROZEN_SSIDS.has(trimmed)) {
    return; // Allowed
  }

  await logViolation({
    target: trimmed,
    tool,
    invokedBy,
    reason: `SSID "${trimmed}" not in allowed list: ${[...FROZEN_SSIDS].join(", ") || "(none configured)"}`,
    timestamp: new Date(),
  });
  throw new WhitelistViolationError(
    `SSID "${trimmed}" is not in the allowed audit whitelist`,
    trimmed,
    tool,
  );
}

// ─── Error Class ─────────────────────────────────────────────────────────────

export class WhitelistViolationError extends Error {
  public readonly target: string;
  public readonly tool: string;

  constructor(message: string, target: string, tool: string) {
    super(message);
    this.name = "WhitelistViolationError";
    this.target = target;
    this.tool = tool;
  }
}

// ─── Introspection (read-only, for health checks and embeds) ─────────────────

export function getWhitelistSummary(): { cidrs: readonly string[]; ssids: readonly string[] } {
  return {
    cidrs: FROZEN_CIDRS,
    ssids: [...FROZEN_SSIDS],
  };
}

export function isWhitelistConfigured(): boolean {
  return FROZEN_CIDRS.length > 2 || FROZEN_SSIDS.size > 0; // >2 because localhost is always present
}
