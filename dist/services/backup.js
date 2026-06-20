import logger from "../utils/logger.js";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const DB_PATH = path.resolve(process.cwd(), "database.sqlite");
const MAX_BACKUPS = 7;
export function startBackupService(client) {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        logger.info("[Backup] Dossier ./backups/ cree");
    }
    cron.schedule("0 0 * * *", () => { performBackup(client); });
    logger.info("[Backup] Service de sauvegarde programme (minuit chaque jour)");
}
async function performBackup(client) {
    try {
        if (!fs.existsSync(DB_PATH)) {
            logger.error("[Backup] Fichier database.sqlite introuvable");
            return;
        }
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const ts = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "-" + pad(now.getHours()) + pad(now.getMinutes());
        const backupName = "backup-db-" + ts + ".db";
        const backupPath = path.join(BACKUP_DIR, backupName);
        fs.copyFileSync(DB_PATH, backupPath);
        logger.info("[Backup] Sauvegarde creee : " + backupName);
        const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup-db-") && f.endsWith(".db")).sort();
        while (files.length > MAX_BACKUPS) {
            const oldest = files.shift();
            fs.unlinkSync(path.join(BACKUP_DIR, oldest));
            logger.info("[Backup] Ancienne sauvegarde supprimee : " + oldest);
        }
        if (client && config.logChannel) {
            try {
                const channel = await client.channels.fetch(config.logChannel);
                if (channel?.isTextBased()) {
                    const sizeKB = (fs.statSync(backupPath).size / 1024).toFixed(1);
                    await channel.send({ content: "📁 **Sauvegarde automatique** — " + backupName + "\nTaille : " + sizeKB + " Ko" });
                }
            }
            catch (err) {
                logger.error("[Backup] Impossible d envoyer la notification Discord:", String(err));
            }
        }
    }
    catch (error) {
        logger.error("[Backup] Erreur lors de la sauvegarde :", String(error));
    }
}
export async function manualBackup(client) {
    await performBackup(client);
}
//# sourceMappingURL=backup.js.map