/**
 * rcloneSync.ts — Sync des backups DB vers le cloud via rclone.
 *
 * Utilise rclone (CLI) pour synchroniser le dossier de backups
 * vers un remote configure (S3, Google Drive, Backblaze, etc.).
 *
 * Prerequis:
 *   1. Installer rclone: https://rclone.org/install/
 *   2. Configurer un remote: rclone config
 *   3. Definir RCLONE_REMOTE dans .env (ex: "my-s3:bot-backups")
 *
 * Si rclone n'est pas installe ou RCLONE_REMOTE non configure, no-op.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import logger from "./logger.js";

const execFileAsync = promisify(execFile);

const RCLONE_REMOTE = process.env.RCLONE_REMOTE || "";
const BACKUP_DIR = join(process.cwd(), "backups");

/**
 * Sync le dossier de backups vers le remote rclone.
 * Utilise `rclone sync` (mirror — supprime les fichiers distants absents localement).
 */
export async function syncBackupsToCloud(): Promise<void> {
  if (!RCLONE_REMOTE) {
    logger.debug("[rclone] RCLONE_REMOTE non configure — sync skip");
    return;
  }

  try {
    const { stderr } = await execFileAsync(
      "rclone",
      [
        "sync",
        BACKUP_DIR,
        RCLONE_REMOTE,
        "--verbose",
        "--transfers",
        "4",
        "--checkers",
        "8",
        "--contimeout",
        "60s",
        "--timeout",
        "300s",
        "--retries",
        "3",
        "--low-level-retries",
        "10",
      ],
      { timeout: 600_000 },
    ); // 10 min max

    if (stderr) logger.info(`[rclone] ${stderr.trim()}`);
    logger.info("[rclone] Sync backups vers cloud termine ✅");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found") || msg.includes("ENOENT")) {
      logger.warn(
        "[rclone] rclone non installe — sync desactive. Installez rclone: https://rclone.org/install/",
      );
    } else {
      logger.error(`[rclone] Erreur sync: ${msg}`);
    }
  }
}
