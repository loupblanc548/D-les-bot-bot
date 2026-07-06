import { Client, TextChannel } from "discord.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, unlink, readdir } from "fs/promises";
import { join } from "path";
import logger from "../../utils/logger.js";
import { syncBackupsToCloud } from "../../utils/rcloneSync.js";
const execFileAsync = promisify(execFile);

const BACKUP_DIR = join(process.cwd(), "backups");
const BACKUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 jours — hebdomadaire
const MAX_BACKUPS = 7; // Garder 7 jours de backups

interface BackupStats {
  lastBackup: Date | null;
  backupCount: number;
  totalSize: number;
  lastError: string | null;
}

const backupStats: BackupStats = {
  lastBackup: null,
  backupCount: 0,
  totalSize: 0,
  lastError: null,
};

export function startDatabaseBackup(client: Client): void {
  logger.info("[DatabaseBackup] Starting automatic database backup system");

  const _backupInterval = setInterval(async () => {
    await performBackup(client);
  }, BACKUP_INTERVAL);
  if (_backupInterval.unref) _backupInterval.unref();

  // Premier backup après 1 minute
  setTimeout(async () => {
    await performBackup(client);
  }, 60 * 1000);
}

async function performBackup(client: Client): Promise<void> {
  try {
    logger.info("[DatabaseBackup] Starting backup...");
    const startTime = Date.now();

    // Créer le dossier de backups s'il n'existe pas
    await mkdir(BACKUP_DIR, { recursive: true });

    // Générer le nom du fichier de backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = join(BACKUP_DIR, `backup-${timestamp}.sql`);

    // Exécuter pg_dump via Prisma
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL not defined");
    }

    // Utiliser pg_dump avec execFile (anti-injection: pas de shell)
    const { stdout } = await execFileAsync("pg_dump", [databaseUrl]);
    const { writeFile } = await import("fs/promises");
    await writeFile(backupFile, stdout);

    // Compresser le backup avec gzip
    const compressedFile = `${backupFile}.gz`;
    await execFileAsync("gzip", [backupFile]);

    // Obtenir la taille du fichier compressé
    const { size } = await import("fs").then((fs) => fs.promises.stat(compressedFile));

    // Nettoyer les vieux backups (rotation)
    await cleanupOldBackups();

    // Mettre à jour les statistiques
    backupStats.lastBackup = new Date();
    backupStats.backupCount++;
    backupStats.totalSize = size;
    backupStats.lastError = null;

    const executionTime = Date.now() - startTime;
    logger.info(
      `[DatabaseBackup] Backup completed in ${executionTime}ms, size: ${(size / 1024 / 1024).toFixed(2)}MB`,
    );

    // Envoyer une alerte de succès
    await sendBackupAlert(client, true, executionTime, size);

    // Sync vers le cloud (rclone) — non bloquant
    syncBackupsToCloud().catch((err) =>
      logger.error(
        `[DatabaseBackup] rclone sync failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[DatabaseBackup] Error: ${errorMessage}`);
    backupStats.lastError = errorMessage;
    await sendBackupAlert(client, false, 0, 0, errorMessage);
  }
}

async function cleanupOldBackups(): Promise<void> {
  try {
    const files = await readdir(BACKUP_DIR);
    const backupFiles = files.filter((f) => f.startsWith("backup-") && f.endsWith(".sql.gz"));

    // Trier par date (les plus vieux en premier)
    backupFiles.sort();

    // Supprimer les backups au-delà de la limite
    while (backupFiles.length > MAX_BACKUPS) {
      const fileToDelete = backupFiles.shift();
      if (fileToDelete) {
        const filePath = join(BACKUP_DIR, fileToDelete);
        await unlink(filePath);
        logger.info(`[DatabaseBackup] Deleted old backup: ${fileToDelete}`);
      }
    }
  } catch (error) {
    logger.error(
      `[DatabaseBackup] Error cleaning up old backups: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function sendBackupAlert(
  client: Client,
  success: boolean,
  executionTime: number,
  size: number,
  error?: string,
): Promise<void> {
  try {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) {
      logger.error("[BackupAlert] LOG_CHANNEL_ID not defined");
      return;
    }

    const channel = await client.channels.fetch(logChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.error(`[BackupAlert] Invalid log channel: ${logChannelId}`);
      return;
    }

    const statusColor = success ? "32" : "31";
    const statusText = success ? "SUCCÈS" : "ÉCHEC";
    const executionTimeFormatted = (executionTime / 1000).toFixed(2);
    const sizeFormatted = success ? `${(size / 1024 / 1024).toFixed(2)}MB` : "N/A";

    const backupOutput = `\`\`\`ansi
[1;${statusColor}m${statusText}[0m === RAPPORT DE SAUVEGARDE BASE DE DONNÉES ===
> Version Core : f35eede
> Identité     : John_Helldiver.aic

--- MÉTRIQUES BACKUP ---
[1;36mTEMPS[0m]        -> [1;36m ${executionTimeFormatted}s [0m]
[1;36mTAILLE[0m]       -> [1;36m ${sizeFormatted} [0m]
[1;36mDERNIÈRE[0m]     -> ${backupStats.lastBackup ? backupStats.lastBackup.toLocaleString("fr-FR") : "Jamais"}
[1;36mTOTAL BACKUPS[0m] -> ${backupStats.backupCount}

${error ? `[1;31mERREUR[0m] -> ${error}` : ""}

=======================================================
[1;30m// ${success ? "Sauvegarde terminée avec succès." : "Sauvegarde échouée."}[0m\`\`\``;

    await channel.send({ content: backupOutput });
    logger.info("[BackupAlert] Backup report sent");
  } catch (error) {
    logger.error(`[BackupAlert] Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getBackupStats(): BackupStats {
  return { ...backupStats };
}

export async function manualBackup(client: Client): Promise<void> {
  logger.info("[DatabaseBackup] Manual backup requested");
  await performBackup(client);
}
