/**
 * wazuhWatchdog.ts — Proactive Wazuh SIEM Security Watchdog
 *
 * Polls Wazuh Manager API every 60s for critical alerts (level >= 10).
 * Deduplicates via in-memory cache. Validated threats are injected into
 * the agent proactive loop for emergency reasoning.
 */

import { schedule, ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { getLatestAlerts, isWazuhConfigured, type WazuhAlert } from "../services/wazuhClient.js";

let cronJob: ScheduledTask | null = null;
const processedAlertIds = new Set<string>();
const MAX_CACHE_SIZE = 5000;

/**
 * Process a single Wazuh alert — deduplicate, persist, and trigger agent.
 */
async function processAlert(alert: WazuhAlert): Promise<void> {
  const alertId = alert.id;

  // Deduplicate
  if (processedAlertIds.has(alertId)) return;
  processedAlertIds.add(alertId);

  // Prevent unbounded cache growth
  if (processedAlertIds.size > MAX_CACHE_SIZE) {
    const toRemove = processedAlertIds.size - MAX_CACHE_SIZE / 2;
    let removed = 0;
    for (const id of processedAlertIds) {
      processedAlertIds.delete(id);
      removed++;
      if (removed >= toRemove) break;
    }
  }

  const CYAN = "\x1b[36m";
  const RED = "\x1b[31m";
  const YELLOW = "\x1b[33m";
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";

  logger.warn(
    `${CYAN}${BOLD}[WAZUH-WATCHDOG]${RESET} ${RED}⚠️ Critical alert L${alert.level}: ${alert.description}${RESET}\n` +
      `  ${YELLOW}Agent:${RESET} ${alert.agent?.name ?? "unknown"} (${alert.agent?.ip ?? "N/A"})\n` +
      `  ${YELLOW}Rule:${RESET} ${alert.rule?.description ?? "N/A"} (ID: ${alert.rule?.id ?? "N/A"})\n` +
      `  ${YELLOW}Source IP:${RESET} ${alert.data?.srcip ?? "N/A"}\n` +
      `  ${YELLOW}Timestamp:${RESET} ${alert.timestamp}`,
  );

  // Persist to SecurityIncident table
  try {
    await prisma.securityIncident.upsert({
      where: { wazuhAlertId: alertId },
      create: {
        wazuhAlertId: alertId,
        level: alert.level,
        description: alert.description,
        endpointName: alert.agent?.name ?? "unknown",
        agentAssessment: `Rule: ${alert.rule?.description ?? "N/A"} | Source: ${alert.data?.srcip ?? "N/A"} | File: ${alert.data?.file ?? "N/A"} | PID: ${alert.data?.pid ?? "N/A"}`,
        status: "OPEN",
      },
      update: {},
    }).catch(() => {});
  } catch {
    // Non-fatal — DB may not have the table yet
  }

  // ── HONEYTOKEN FIM TRIPWIRE ──
  // If Wazuh FIM logs a READ or WRITE on a honeytoken file, bypass level checks
  // and instantly route to Layer 4 SOAR Validation Gate.
  const fimFile = alert.data?.file ?? "";
  if (fimFile) {
    try {
      const { isHoneytokenHit } = await import("../services/honeytokenEngine.js");
      if (isHoneytokenHit(fimFile)) {
        logger.error(
          `${RED}${BOLD}[HONEYTOKEN]${RESET} ${RED}FIM tripwire triggered! Bypassing level checks → SOAR${RESET}`,
        );
        const { executeActiveDefense } = await import("../services/activeDefenseEngine.js");
        await executeActiveDefense(alert);
        return;
      }
    } catch {
      // Non-fatal
    }
  }

  // Trigger active defense engine for critical threats
  if (alert.level >= 12) {
    try {
      const { executeActiveDefense } = await import("../services/activeDefenseEngine.js");
      await executeActiveDefense(alert);
    } catch (err) {
      logger.error(
        `[WAZUH-WATCHDOG] Active defense failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Poll Wazuh for critical alerts.
 */
async function pollWazuhAlerts(): Promise<void> {
  if (!isWazuhConfigured()) return;

  try {
    const alerts = await getLatestAlerts(10);
    for (const alert of alerts) {
      await processAlert(alert).catch((err) =>
        logger.error(`[WAZUH-WATCHDOG] Process alert failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  } catch (err) {
    logger.debug(`[WAZUH-WATCHDOG] Poll error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Start the Wazuh watchdog cron (every 60s).
 */
export function startWazuhWatchdog(): void {
  if (cronJob) {
    logger.warn("[WAZUH-WATCHDOG] Already running — ignored");
    return;
  }

  if (!isWazuhConfigured()) {
    logger.info("[WAZUH-WATCHDOG] Wazuh not configured — watchdog disabled");
    return;
  }

  cronJob = schedule("* * * * *", () => {
    void pollWazuhAlerts().catch(() => {});
  });

  // Initial poll after 10s
  setTimeout(() => {
    void pollWazuhAlerts().catch(() => {});
  }, 10_000);

  if (cronJob.unref) cronJob.unref();
  logger.info(`${"\x1b[36m"}[WAZUH-WATCHDOG] Cron started — polling every 60s for critical alerts (level >= 10)${"\x1b[0m"}`);
}

export function stopWazuhWatchdog(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[WAZUH-WATCHDOG] Cron stopped");
  }
}
