/**
 * PII Scanner & Data Retention
 *
 * Scans database for PII patterns (emails, phone numbers) in message content
 * and applies retention policy: auto-delete messages older than 90 days.
 *
 * Usage: npx tsx src/scripts/pii-scan.ts
 * Cron: runs daily via cron/notificationCleanup.ts
 */

import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const RETENTION_DAYS = parseInt(process.env.PII_RETENTION_DAYS || "90", 10);
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;

export async function scanForPii(): Promise<{ emails: number; phones: number; deleted: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let emails = 0;
  let phones = 0;

  // Scan recent logs for PII (not deleted, within retention window)
  const recentMessages = await prisma.log.findMany({
    where: {
      createdAt: { gte: cutoff },
      details: { not: null },
    },
    select: { id: true, details: true },
    take: 1000,
  });

  for (const msg of recentMessages) {
    if (!msg.details) continue;
    const emailMatches = msg.details.match(EMAIL_PATTERN);
    const phoneMatches = msg.details.match(PHONE_PATTERN);
    if (emailMatches) emails += emailMatches.length;
    if (phoneMatches) phones += phoneMatches.length;
  }

  // Delete logs older than retention period
  const deleted = await prisma.log.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  logger.info(
    `[PII] Scan complete: ${emails} emails, ${phones} phones found in recent messages. ` +
      `${deleted.count} messages older than ${RETENTION_DAYS} days deleted (retention policy).`,
  );

  return { emails, phones, deleted: deleted.count };
}

// Run if called directly
if (process.argv[1]?.includes("pii-scan")) {
  scanForPii()
    .then((result) => {
      console.log("PII scan result:", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error("PII scan failed:", err);
      process.exit(1);
    });
}
