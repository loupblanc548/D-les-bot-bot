/**
 * shodanWatchdog.ts — Bi-weekly Shodan Exposure Auditor
 *
 * Layer 6.2: Queries Shodan API for the admin's public infrastructure
 * IP blocks. If database ports (5432, 6379) or other sensitive ports
 * are exposed, triggers Layer 4 SOAR Validation Gate to propose
 * automated firewall lockdown.
 */

import { schedule, ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { searchShodan, isShodanConfigured } from "../services/shodan.js";
import { executeActiveDefense } from "../services/activeDefenseEngine.js";
import type { WazuhAlert } from "../services/wazuhClient.js";

const CYAN = "\x1b[36m";
const PURPLE = "\x1b[35m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const MY_VPS_IP = process.env.MY_VPS_IP ?? process.env.VPS_IP ?? "";

// Ports that should NEVER be exposed to the public internet
const DANGEROUS_EXPOSED_PORTS = [5432, 6379, 27017, 3306, 1433, 9200, 11211];

// ─── Audit Logic ─────────────────────────────────────────────────────────────

interface ExposureFinding {
  ip: string;
  port: number;
  service: string;
  product: string;
  severity: "CRITICAL" | "HIGH";
}

async function runShodanExposureAudit(): Promise<void> {
  if (!isShodanConfigured()) {
    logger.info(`${CYAN}[SHODAN-WATCHDOG]${RESET} Shodan API key not configured — skipping audit`);
    return;
  }

  if (!MY_VPS_IP) {
    logger.info(`${CYAN}[SHODAN-WATCHDOG]${RESET} No VPS IP configured (MY_VPS_IP) — skipping audit`);
    return;
  }

  logger.info(
    `${PURPLE}${BOLD}[SHODAN-WATCHDOG]${RESET} ${CYAN}Starting exposure audit for ${MY_VPS_IP}${RESET}`,
  );

  const findings: ExposureFinding[] = [];

  try {
    const result = await searchShodan(`ip:${MY_VPS_IP}`);

    for (const match of result.matches) {
      const severity: ExposureFinding["severity"] = DANGEROUS_EXPOSED_PORTS.includes(match.port) ? "CRITICAL" : "HIGH";
      findings.push({
        ip: match.ip,
        port: match.port,
        service: match.service,
        product: match.product || "",
        severity,
      });
    }
  } catch (err) {
    logger.error(`[SHODAN-WATCHDOG] Audit failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const dangerousFindings = findings.filter(
    (f) => f.severity === "CRITICAL" || DANGEROUS_EXPOSED_PORTS.includes(f.port),
  );

  if (dangerousFindings.length === 0) {
    logger.info(`${CYAN}[SHODAN-WATCHDOG]${RESET} ✅ No dangerous port exposure detected for ${MY_VPS_IP}`);
    return;
  }

  logger.error(
    `${RED}${BOLD}[SHODAN-WATCHDOG]${RESET} ${RED}${dangerousFindings.length} dangerous exposure(s) detected!${RESET}`,
  );

  for (const finding of dangerousFindings) {
    logger.error(
      `${RED}  → ${finding.ip}:${finding.port} (${finding.service}) — ${finding.severity}${RESET}`,
    );

    const syntheticAlert: WazuhAlert = {
      id: `shodan_exposure_${finding.ip}_${finding.port}_${Date.now()}`,
      level: 15,
      description: `Shodan Exposure: Port ${finding.port} (${finding.service}) publicly accessible on ${finding.ip}`,
      rule: {
        id: "shodan_exposure",
        description: `Exposed ${finding.service} port ${finding.port} on public IP`,
        level: 15,
        groups: ["shodan", "exposure", "network"],
      },
      agent: {
        id: "shodan-watchdog",
        name: "shodan-watchdog",
        ip: finding.ip,
      },
      manager: { name: "shodan-watchdog" },
      data: {
        srcip: finding.ip,
      },
      timestamp: new Date().toISOString(),
      location: "shodan-watchdog",
    };

    try {
      await executeActiveDefense(syntheticAlert);
    } catch (err) {
      logger.error(`[SHODAN-WATCHDOG] Failed to route to SOAR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ─── Cron Scheduler ──────────────────────────────────────────────────────────

let cronTask: ScheduledTask | null = null;

export function startShodanWatchdog(): void {
  const cronExpression = "0 3 */14 * *";

  cronTask = schedule(cronExpression, async () => {
    try {
      await runShodanExposureAudit();
    } catch (err) {
      logger.error(`[SHODAN-WATCHDOG] Cron error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  setTimeout(() => {
    void runShodanExposureAudit().catch(() => {});
  }, 10_000);

  logger.info(
    `${PURPLE}${BOLD}[SHODAN-WATCHDOG]${RESET} ${CYAN}Cron started — bi-weekly exposure audit (every 14 days at 03:00 UTC)${RESET}`,
  );
}
