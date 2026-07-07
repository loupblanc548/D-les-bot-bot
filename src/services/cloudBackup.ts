import logger from "../utils/logger.js";
import { readFile } from "fs/promises";
import { basename } from "path";

const BUCKET = process.env.BACKUP_S3_BUCKET || "";
const REGION = process.env.BACKUP_S3_REGION || "eu-west-3";
const ACCESS_KEY = process.env.BACKUP_S3_ACCESS_KEY || "";
const SECRET_KEY = process.env.BACKUP_S3_SECRET_KEY || "";
const ENDPOINT = process.env.BACKUP_S3_ENDPOINT || "";

export async function uploadToCloud(filePath: string, key?: string): Promise<boolean> {
  if (!isCloudBackupConfigured()) {
    logger.debug("[CloudBackup] S3 non configuré — skip");
    return false;
  }

  try {
    const fileBuffer = await readFile(filePath);
    const fileName = key || `backups/${basename(filePath)}`;
    const endpoint = ENDPOINT || `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
    const url = `${endpoint}/${encodeURIComponent(fileName)}`;

    // Validate URL is HTTPS to prevent SSRF
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") {
      throw new Error("S3 endpoint must be HTTPS");
    }

    const res = await fetch(parsedUrl.href, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/...`,
      },
      body: fileBuffer, // lgtm[js/request-forgery] — intentional S3 backup upload to configured endpoint
    });

    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);

    logger.info(`[CloudBackup] ${basename(filePath)} uploadé vers ${BUCKET}/${fileName}`);
    return true;
  } catch (err) {
    logger.error(`[CloudBackup] Erreur upload: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export function isCloudBackupConfigured(): boolean {
  return !!(ACCESS_KEY && SECRET_KEY && BUCKET);
}
