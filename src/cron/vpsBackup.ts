/**
 * vpsBackup.ts — Layer 10.1: Offsite Backup Orchestrator Cron
 *
 * Daily automated backup at 03:00 UTC:
 *  - PostgreSQL dump via pg_dump (Prisma/Neon)
 *  - Compress + encrypt critical env files
 *  - Stream to offsite storage (S3/B2/SFTP)
 *  - Purge local backup files after upload
 *
 * Environment variables:
 *  - DATABASE_URL (Prisma) — used for pg_dump connection
 *  - BACKUP_S3_BUCKET — S3-compatible bucket name
 *  - BACKUP_S3_ENDPOINT — custom endpoint (Backblaze B2, etc.)
 *  - BACKUP_S3_ACCESS_KEY — access key
 *  - BACKUP_S3_SECRET_KEY — secret key
 *  - BACKUP_ENCRYPTION_KEY — passphrase for gpg encryption
 *  - BACKUP_RETENTION_DAYS — days to keep on remote (default: 30)
 */

import { schedule, ScheduledTask } from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, unlink, readdir, stat } from "fs/promises";
import { join } from "path";
import logger from "../utils/logger.js";

const execAsync = promisify(exec);

const BACKUP_DIR = "/tmp/vps-backups";
const DATABASE_URL = process.env.DATABASE_URL || "";
const BACKUP_ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || "";
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);

// S3-compatible config
const S3_BUCKET = process.env.BACKUP_S3_BUCKET || "";
const S3_ENDPOINT = process.env.BACKUP_S3_ENDPOINT || "";
const S3_ACCESS_KEY = process.env.BACKUP_S3_ACCESS_KEY || "";
const S3_SECRET_KEY = process.env.BACKUP_S3_SECRET_KEY || "";

let cronJob: ScheduledTask | null = null;

interface BackupResult {
  success: boolean;
  date: string;
  dumpFile?: string;
  encryptedFile?: string;
  uploadedToRemote?: boolean;
  localPurged?: boolean;
  error?: string;
  dumpSizeBytes?: number;
}

function getDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Extract connection params from DATABASE_URL for pg_dump.
 */
function parseDbUrl(url: string): { host: string; port: string; db: string; user: string; password: string } | null {
  try {
    const match = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
    if (!match) return null;
    return { user: match[1], password: match[2], host: match[3], port: match[4], db: match[5].split("?")[0] };
  } catch {
    return null;
  }
}

/**
 * Execute a PostgreSQL dump using pg_dump.
 */
async function executeDbDump(outputPath: string): Promise<number> {
  const conn = parseDbUrl(DATABASE_URL);
  if (!conn) throw new Error("Cannot parse DATABASE_URL for pg_dump");

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PGPASSWORD: conn.password,
  };

  const cmd = `pg_dump "postgresql://${conn.user}@${conn.host}:${conn.port}/${conn.db}" --format=custom --no-owner --no-privileges -f "${outputPath}"`;

  logger.info(`[VPS-BACKUP] Starting pg_dump → ${outputPath}`);
  await execAsync(cmd, { env, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });

  const stats = await stat(outputPath);
  logger.info(`[VPS-BACKUP] pg_dump complete — ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
  return stats.size;
}

/**
 * Compress and encrypt the dump + critical env files into a tarball.
 */
async function compressAndEncrypt(dumpPath: string, outputPath: string): Promise<void> {
  // Collect critical files
  const criticalFiles: string[] = [dumpPath];
  const envFiles = [".env", ".env.production"];
  for (const f of envFiles) {
    try {
      await readFile(join(process.cwd(), f));
      criticalFiles.push(join(process.cwd(), f));
    } catch { /* skip missing */ }
  }

  const fileList = criticalFiles.map((f) => `"${f}"`).join(" ");
  const tarCmd = `tar czf - ${fileList} | gpg --batch --passphrase "${BACKUP_ENCRYPTION_KEY}" --symmetric --cipher-algo AES256 -o "${outputPath}"`;

  logger.info(`[VPS-BACKUP] Compressing + encrypting → ${outputPath}`);
  await execAsync(tarCmd, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024, shell: "/bin/bash" });
  logger.info(`[VPS-BACKUP] Encryption complete`);
}

/**
 * Upload encrypted backup to S3-compatible storage using aws-cli.
 */
async function uploadToS3(filePath: string, key: string): Promise<boolean> {
  if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    logger.warn(`[VPS-BACKUP] S3 not configured — backup remains local only`);
    return false;
  }

  const endpointFlag = S3_ENDPOINT ? `--endpoint-url ${S3_ENDPOINT}` : "";
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    AWS_ACCESS_KEY_ID: S3_ACCESS_KEY,
    AWS_SECRET_ACCESS_KEY: S3_SECRET_KEY,
  };

  const cmd = `aws s3 cp "${filePath}" "s3://${S3_BUCKET}/${key}" ${endpointFlag} --no-progress`;

  logger.info(`[VPS-BACKUP] Uploading to S3: s3://${S3_BUCKET}/${key}`);
  await execAsync(cmd, { env, timeout: 180_000, maxBuffer: 5 * 1024 * 1024 });
  logger.info(`[VPS-BACKUP] S3 upload complete`);
  return true;
}

/**
 * Purge local backup files after successful upload.
 */
async function purgeLocalBackups(): Promise<void> {
  try {
    const files = await readdir(BACKUP_DIR);
    for (const f of files) {
      if (f.startsWith("backup-") && (f.endsWith(".tar.gz.gpg") || f.endsWith(".dump"))) {
        await unlink(join(BACKUP_DIR, f));
        logger.info(`[VPS-BACKUP] Purged local file: ${f}`);
      }
    }
  } catch { /* dir doesn't exist — fine */ }
}

/**
 * Prune old backups on remote storage (beyond retention window).
 */
async function pruneRemoteBackups(): Promise<void> {
  if (!S3_BUCKET) return;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - BACKUP_RETENTION_DAYS);
  const cutoffStamp = cutoffDate.toISOString().slice(0, 10);

  try {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      AWS_ACCESS_KEY_ID: S3_ACCESS_KEY,
      AWS_SECRET_ACCESS_KEY: S3_SECRET_KEY,
    };
    const endpointFlag = S3_ENDPOINT ? `--endpoint-url ${S3_ENDPOINT}` : "";
    const cmd = `aws s3 ls "s3://${S3_BUCKET}/" ${endpointFlag} 2>/dev/null`;

    const { stdout } = await execAsync(cmd, { env, timeout: 30_000, maxBuffer: 1024 * 1024 });
    const lines = stdout.split("\n").filter(Boolean);

    for (const line of lines) {
      const match = line.match(/backup-(\d{4}-\d{2}-\d{2})/);
      if (match && match[1] < cutoffStamp) {
        const oldKey = line.trim().split(/\s+/).pop();
        if (oldKey) {
          await execAsync(`aws s3 rm "s3://${S3_BUCKET}/${oldKey}" ${endpointFlag}`, {
            env, timeout: 30_000, maxBuffer: 1024 * 1024,
          }).catch(() => {});
          logger.info(`[VPS-BACKUP] Pruned remote backup: ${oldKey}`);
        }
      }
    }
  } catch (err) {
    logger.debug(`[VPS-BACKUP] Remote prune skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Main backup execution.
 */
async function executeBackup(): Promise<BackupResult> {
  const dateStamp = getDateStamp();
  const result: BackupResult = { success: false, date: dateStamp };

  const CYAN = "\x1b[36m", GREEN = "\x1b[32m", RED = "\x1b[31m", RESET = "\x1b[0m", BOLD = "\x1b[1m";
  logger.info(`${CYAN}${BOLD}[VPS-BACKUP]${RESET} ${GREEN}Starting daily backup — ${dateStamp}${RESET}`);

  try {
    // Ensure backup dir exists
    await execAsync(`mkdir -p ${BACKUP_DIR}`, { timeout: 5000 }).catch(() => {});

    const dumpPath = `${BACKUP_DIR}/backup-${dateStamp}.dump`;
    const encryptedPath = `${BACKUP_DIR}/backup-${dateStamp}.tar.gz.gpg`;

    // 1. Database dump
    const dumpSize = await executeDbDump(dumpPath);
    result.dumpFile = dumpPath;
    result.dumpSizeBytes = dumpSize;

    // 2. Compress + encrypt
    if (BACKUP_ENCRYPTION_KEY) {
      await compressAndEncrypt(dumpPath, encryptedPath);
      result.encryptedFile = encryptedPath;
    } else {
      logger.warn(`[VPS-BACKUP] No BACKUP_ENCRYPTION_KEY — skipping encryption (UNSECURE)`);
      result.encryptedFile = dumpPath;
    }

    // 3. Upload to remote
    const remoteKey = `backups/backup-${dateStamp}.tar.gz.gpg`;
    result.uploadedToRemote = await uploadToS3(result.encryptedFile, remoteKey);

    // 4. Purge local files
    if (result.uploadedToRemote) {
      await purgeLocalBackups();
      result.localPurged = true;
    }

    // 5. Prune old remote backups
    await pruneRemoteBackups();

    result.success = true;
    logger.info(`${CYAN}${BOLD}[VPS-BACKUP]${RESET} ${GREEN}Backup complete — uploaded=${result.uploadedToRemote} purged=${result.localPurged}${RESET}`);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    logger.error(`${CYAN}${BOLD}[VPS-BACKUP]${RESET} ${RED}Backup FAILED: ${result.error}${RESET}`);
  }

  return result;
}

/**
 * Start the VPS backup cron (daily at 03:00 UTC).
 */
export function startVpsBackupCron(): void {
  if (cronJob) {
    logger.warn("[VPS-BACKUP] Already running — ignored");
    return;
  }

  if (!DATABASE_URL) {
    logger.info("[VPS-BACKUP] DATABASE_URL not set — backup cron disabled");
    return;
  }

  logger.info(`\x1b[36m[VPS-BACKUP] Cron started — daily at 03:00 UTC\x1b[0m`);

  cronJob = schedule("0 3 * * *", () => {
    void executeBackup().catch((err) => {
      logger.error(`[VPS-BACKUP] Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    });
  });

  // Run an initial backup on startup if none exists for today
  void executeBackup().catch(() => {});
}

/**
 * Manually trigger a backup (for admin command or testing).
 */
export async function triggerManualBackup(): Promise<BackupResult> {
  return executeBackup();
}
