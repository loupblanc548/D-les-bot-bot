/**
 * uptimeRobot.ts — UptimeRobot API integration for external monitoring.
 *
 * Provides uptime monitoring from external locations (not just internal health checks).
 * Can create monitors, get status, and send alerts when the bot goes down.
 *
 * Free tier: 50 monitors, 5-minute intervals.
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

const BASE_URL = "https://api.uptimerobot.com/v2";

export function isUptimeRobotAvailable(): boolean {
  return !!config.uptimeRobotApiKey;
}

export interface Monitor {
  id: string;
  friendlyName: string;
  url: string;
  status: number;
  uptimeRatio: number;
}

export async function getMonitors(): Promise<Monitor[]> {
  if (!isUptimeRobotAvailable()) return [];

  try {
    const res = await fetch(`${BASE_URL}/getMonitors`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        api_key: config.uptimeRobotApiKey,
        format: "json",
        all_time_uptime_ratio: "1",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn(`[UptimeRobot] HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      stat: string;
      monitors?: Array<{
        id: string;
        friendly_name: string;
        url: string;
        status: number;
        all_time_uptime_ratio: string;
      }>;
    };

    if (data.stat !== "ok" || !data.monitors) return [];

    return data.monitors.map((m) => ({
      id: m.id,
      friendlyName: m.friendly_name,
      url: m.url,
      status: m.status,
      uptimeRatio: parseFloat(m.all_time_uptime_ratio) || 0,
    }));
  } catch (error) {
    logger.warn(`[UptimeRobot] Error: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function createMonitor(
  friendlyName: string,
  url: string,
): Promise<string | null> {
  if (!isUptimeRobotAvailable()) return null;

  try {
    const res = await fetch(`${BASE_URL}/newMonitor`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        api_key: config.uptimeRobotApiKey,
        format: "json",
        friendly_name: friendlyName,
        url: url,
        type: "1",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { stat: string; monitor?: { id: string } };
    return data.monitor?.id ?? null;
  } catch {
    return null;
  }
}

export async function getUptimeRatio(monitorId: string): Promise<number> {
  if (!isUptimeRobotAvailable()) return -1;

  try {
    const res = await fetch(`${BASE_URL}/getMonitors`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        api_key: config.uptimeRobotApiKey,
        format: "json",
        monitors: monitorId,
        all_time_uptime_ratio: "1",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return -1;

    const data = (await res.json()) as {
      stat: string;
      monitors?: Array<{ all_time_uptime_ratio: string }>;
    };

    if (data.stat !== "ok" || !data.monitors?.length) return -1;
    return parseFloat(data.monitors[0].all_time_uptime_ratio) || 0;
  } catch {
    return -1;
  }
}
