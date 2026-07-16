import { Client, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { config } from "../config.js";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const DB_PATH = path.resolve(process.cwd(), "database.sqlite");
const MAX_BACKUPS = 7;

export function startBackupService(client: Client) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    logger.info("[Backup] Dossier ./backups/ cree");
  }
  // Backup hebdomadaire complet (lundi 02:00)
  cron.schedule("0 2 * * 1", () => {
    performBackup(client);
  });
  // Backup automatique DB toutes les 6 heures
  cron.schedule("0 */6 * * *", () => {
    performAutoBackup(client);
  });
  logger.info("[Backup] Service de sauvegarde programmé (hebdomadaire + auto 6h)");
}

async function performAutoBackup(client: Client) {
  try {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts =
      now.getFullYear() +
      "-" +
      pad(now.getMonth() + 1) +
      "-" +
      pad(now.getDate()) +
      "-" +
      pad(now.getHours()) +
      pad(now.getMinutes());
    const backupName = "auto-backup-" + ts + ".db";
    const backupPath = path.join(BACKUP_DIR, backupName);

    // Try pg_dump for Neon/PostgreSQL
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && dbUrl.startsWith("postgresql")) {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      try {
        await execFileAsync("pg_dump", [dbUrl, "-f", backupPath], { timeout: 120_000 });
        logger.info(`[Backup] Auto-backup PostgreSQL: ${backupName}`);
      } catch {
        // Fallback: just copy sqlite if exists
        if (fs.existsSync(DB_PATH)) {
          fs.copyFileSync(DB_PATH, backupPath);
          logger.info(`[Backup] Auto-backup SQLite: ${backupName}`);
        }
      }
    } else if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupPath);
      logger.info(`[Backup] Auto-backup SQLite: ${backupName}`);
    }

    // Cleanup old auto-backups (keep last 7)
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("auto-backup-"))
      .map((f) => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    for (const file of files.slice(7)) {
      fs.unlinkSync(path.join(BACKUP_DIR, file.name));
    }
  } catch (err) {
    logger.error(
      `[Backup] Erreur auto-backup: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function performBackup(client: Client) {
  try {
    if (!fs.existsSync(DB_PATH)) {
      logger.error("[Backup] Fichier database.sqlite introuvable");
      return;
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts =
      now.getFullYear() +
      "-" +
      pad(now.getMonth() + 1) +
      "-" +
      pad(now.getDate()) +
      "-" +
      pad(now.getHours()) +
      pad(now.getMinutes());
    const backupName = "backup-db-" + ts + ".db";
    const backupPath = path.join(BACKUP_DIR, backupName);
    fs.copyFileSync(DB_PATH, backupPath);
    logger.info("[Backup] Sauvegarde creee : " + backupName);
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f: string) => f.startsWith("backup-db-") && f.endsWith(".db"))
      .sort();
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift()!;
      fs.unlinkSync(path.join(BACKUP_DIR, oldest));
      logger.info("[Backup] Ancienne sauvegarde supprimee : " + oldest);
    }
    if (client && config.logChannel) {
      try {
        const channel = await client.channels.fetch(config.logChannel);
        if (channel?.isTextBased()) {
          const sizeKB = (fs.statSync(backupPath).size / 1024).toFixed(1);
          await (channel as TextChannel).send({
            content:
              "📁 **Sauvegarde automatique** — " + backupName + "\nTaille : " + sizeKB + " Ko",
          });
        }
      } catch (err) {
        logger.error("[Backup] Impossible d envoyer la notification Discord:", String(err));
      }
    }
  } catch (error) {
    logger.error("[Backup] Erreur lors de la sauvegarde :", String(error));
  }
}

export async function manualBackup(client: Client) {
  await performBackup(client);
}
