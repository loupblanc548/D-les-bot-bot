"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBackupService = startBackupService;
exports.manualBackup = manualBackup;
const logger_1 = __importDefault(require("../utils/logger"));
const node_cron_1 = __importDefault(require("node-cron"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const BACKUP_DIR = path_1.default.resolve(process.cwd(), "backups");
const DB_PATH = path_1.default.resolve(process.cwd(), "database.sqlite");
const MAX_BACKUPS = 7;
function startBackupService(client) {
    if (!fs_1.default.existsSync(BACKUP_DIR)) {
        fs_1.default.mkdirSync(BACKUP_DIR, { recursive: true });
        logger_1.default.info("[Backup] Dossier ./backups/ cree");
    }
    node_cron_1.default.schedule("0 0 * * *", () => { performBackup(client); });
    logger_1.default.info("[Backup] Service de sauvegarde programme (minuit chaque jour)");
}
async function performBackup(client) {
    try {
        if (!fs_1.default.existsSync(DB_PATH)) {
            logger_1.default.error("[Backup] Fichier database.sqlite introuvable");
            return;
        }
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const ts = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "-" + pad(now.getHours()) + pad(now.getMinutes());
        const backupName = "backup-db-" + ts + ".db";
        const backupPath = path_1.default.join(BACKUP_DIR, backupName);
        fs_1.default.copyFileSync(DB_PATH, backupPath);
        logger_1.default.info("[Backup] Sauvegarde creee : " + backupName);
        const files = fs_1.default.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup-db-") && f.endsWith(".db")).sort();
        while (files.length > MAX_BACKUPS) {
            const oldest = files.shift();
            fs_1.default.unlinkSync(path_1.default.join(BACKUP_DIR, oldest));
            logger_1.default.info("[Backup] Ancienne sauvegarde supprimee : " + oldest);
        }
        if (client && config_1.config.logChannel) {
            try {
                const channel = await client.channels.fetch(config_1.config.logChannel);
                if (channel?.isTextBased()) {
                    const sizeKB = (fs_1.default.statSync(backupPath).size / 1024).toFixed(1);
                    await channel.send({ content: "📁 **Sauvegarde automatique** — " + backupName + "\nTaille : " + sizeKB + " Ko" });
                }
            }
            catch (err) {
                logger_1.default.error("[Backup] Impossible d envoyer la notification Discord:", String(err));
            }
        }
    }
    catch (error) {
        logger_1.default.error("[Backup] Erreur lors de la sauvegarde :", String(error));
    }
}
async function manualBackup(client) {
    await performBackup(client);
}
//# sourceMappingURL=backup.js.map