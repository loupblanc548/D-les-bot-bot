/**
 * wazuhClient.ts — Wazuh SIEM/EDR REST API Client
 *
 * Handles JWT token negotiation/rotation with the Wazuh Manager API.
 * Provides typed methods for alerts, agent status, and FIM events.
 *
 * All network calls are wrapped in try/catch with detailed telemetry.
 */

import logger from "../utils/logger.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const WAZUH_HOST = process.env.WAZUH_HOST ?? "";
const WAZUH_PORT = process.env.WAZUH_PORT ?? "55000";
const WAZUH_USER = process.env.WAZUH_USER ?? "wazuh";
const WAZUH_PASSWORD = process.env.WAZUH_PASSWORD ?? "";
const WAZUH_API_TIMEOUT_MS = 10_000;

const WAZUH_BASE_URL = WAZUH_HOST ? `https://${WAZUH_HOST}:${WAZUH_PORT}` : "";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WazuhAlert {
  id: string;
  level: number;
  description: string;
  rule: { id: string; description: string; level: number; groups: string[] };
  agent: { id: string; name: string; ip: string };
  manager: { name: string };
  data: { srcip?: string; dstip?: string; srcuser?: string; file?: string; pid?: string };
  timestamp: string;
  location: string;
}

export interface WazuhAgentStatus {
  id: string;
  name: string;
  ip: string;
  status: string; // "active" | "disconnected" | "never_connected"
  version: string;
  os: { name: string; version: string; arch: string };
  lastKeepAlive: string;
}

export interface WazuhFimEvent {
  id: string;
  file: string;
  event: string; // "added" | "modified" | "deleted"
  mode: string;
  audit: { user: string; process: string };
  timestamp: string;
  agent: { id: string; name: string };
}

// ─── JWT Token Management ────────────────────────────────────────────────────

let jwtToken: string | null = null;
let tokenExpiry: number = 0;
let tokenNegotiating: Promise<string> | null = null;

/**
 * Negotiate a JWT token with the Wazuh Manager API.
 * Uses basic auth, returns the token string.
 */
async function negotiateToken(): Promise<string> {
  if (!WAZUH_HOST) {
    throw new Error("WAZUH_HOST not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAZUH_API_TIMEOUT_MS);

  try {
    const res = await fetch(`${WAZUH_BASE_URL}/security/user/authenticate`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${WAZUH_USER}:${WAZUH_PASSWORD}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Wazuh auth failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { data?: { token?: string } };
    const token = data?.data?.token;
    if (!token) {
      throw new Error("Wazuh auth: no token in response");
    }

    // Tokens are valid for 900s (15min) by default — refresh at 12min
    jwtToken = token;
    tokenExpiry = Date.now() + 12 * 60 * 1000;

    logger.info("[WazuhClient] JWT token negotiated successfully");
    return token;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get a valid JWT token, negotiating or refreshing as needed.
 */
async function getToken(): Promise<string> {
  if (jwtToken && Date.now() < tokenExpiry) {
    return jwtToken;
  }

  // Prevent concurrent token negotiations
  if (tokenNegotiating) {
    return tokenNegotiating;
  }

  tokenNegotiating = negotiateToken().finally(() => {
    tokenNegotiating = null;
  });

  return tokenNegotiating;
}

/**
 * Make an authenticated request to the Wazuh API.
 */
async function wazuhRequest(endpoint: string, params?: Record<string, string>): Promise<any> {
  const token = await getToken();
  const url = new URL(`${WAZUH_BASE_URL}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAZUH_API_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.status === 401) {
      // Token expired — force renegotiation
      jwtToken = null;
      tokenExpiry = 0;
      throw new Error("Wazuh token expired — renegotiating");
    }

    if (!res.ok) {
      throw new Error(`Wazuh API ${endpoint}: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if Wazuh integration is configured.
 */
export function isWazuhConfigured(): boolean {
  return WAZUH_HOST.length > 0 && WAZUH_PASSWORD.length > 0;
}

/**
 * Get the latest alerts from Wazuh, optionally filtered by minimum rule level.
 */
export async function getLatestAlerts(minLevel: number = 10): Promise<WazuhAlert[]> {
  if (!isWazuhConfigured()) return [];

  try {
    const data = await wazuhRequest("/alerts", {
      level: String(minLevel),
      limit: "100",
      sort: "-timestamp",
    });

    const alerts = data?.data?.affected_items ?? [];
    logger.info(`[WazuhClient] Retrieved ${alerts.length} alerts (level >= ${minLevel})`);
    return alerts as WazuhAlert[];
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[WazuhClient] getLatestAlerts failed: ${errMsg}`);
    return [];
  }
}

/**
 * Get the status of all registered Wazuh agents.
 */
export async function getAgentStatus(): Promise<WazuhAgentStatus[]> {
  if (!isWazuhConfigured()) return [];

  try {
    const data = await wazuhRequest("/agents", {
      status: "active",
      limit: "500",
    });

    const agents = data?.data?.affected_items ?? [];
    logger.info(`[WazuhClient] Retrieved ${agents.length} agent statuses`);
    return agents as WazuhAgentStatus[];
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[WazuhClient] getAgentStatus failed: ${errMsg}`);
    return [];
  }
}

/**
 * Get File Integrity Monitoring (FIM) events for a specific agent.
 */
export async function getFimEvents(agentId: string): Promise<WazuhFimEvent[]> {
  if (!isWazuhConfigured()) return [];

  try {
    const data = await wazuhRequest(`/syscheck/${agentId}`, {
      limit: "100",
      sort: "-timestamp",
    });

    const events = data?.data?.affected_items ?? [];
    logger.info(`[WazuhClient] Retrieved ${events.length} FIM events for agent ${agentId}`);
    return events as WazuhFimEvent[];
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[WazuhClient] getFimEvents failed: ${errMsg}`);
    return [];
  }
}

/**
 * Force token refresh (called on auth failure).
 */
export function invalidateToken(): void {
  jwtToken = null;
  tokenExpiry = 0;
}
