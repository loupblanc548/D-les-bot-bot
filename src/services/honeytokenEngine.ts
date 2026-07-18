/**
 * honeytokenEngine.ts — Honeytoken Generation & FIM Tripwire System
 *
 * Layer 6.1: Generates realistic bait configuration files. If Wazuh FIM
 * logs a READ or WRITE action on these files, bypasses level checks and
 * instantly routes to Layer 4's SOAR Validation Gate.
 *
 * Honeytoken files are designed to look like real credentials/configs
 * but are NEVER used by any service. Any access = intrusion.
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import logger from "../utils/logger.js";

const CYAN = "\x1b[36m";
const PURPLE = "\x1b[35m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ─── Honeytoken Registry ─────────────────────────────────────────────────────

interface Honeytoken {
  path: string;
  type: "CREDENTIALS" | "API_KEY" | "CONFIG" | "SSH_KEY";
  hash: string;
  createdAt: number;
}

const honeytokenRegistry: Map<string, Honeytoken> = new Map();

const BAIT_FILES: Array<{ filename: string; type: Honeytoken["type"]; content: string }> = [
  {
    filename: "neon_root_credentials.json.bak",
    type: "CREDENTIALS",
    content: JSON.stringify(
      {
        database: {
          host: "ep-xxx-pooler.us-east-2.aws.neon.tech",
          port: 5432,
          database: "neondb",
          username: "root_admin",
          password: "NEON_ROOT_$(date +%s)_BACKUP_KEY",
          sslmode: "require",
        },
        note: "Emergency root credentials backup — DO NOT DELETE",
        created: new Date().toISOString(),
      },
      null,
      2,
    ),
  },
  {
    filename: "redis_master_auth.env.bak",
    type: "CREDENTIALS",
    content: `# Redis Master Authentication Backup\nREDIS_MASTER_PASSWORD=RedisMasterBackup2024!\nREDIS_SENTINEL_TOKEN=sentinel_$(date +%s)_auth\nREDIS_CLUSTER_SECRET=cluster_backup_key_neon\n`,
  },
  {
    filename: "aws_root_key_backup.json",
    type: "API_KEY",
    content: JSON.stringify(
      {
        accessKeyId: "AKIA backup root key",
        secretAccessKey: "wJalrXUtneonBACKUP/root/key/2024",
        region: "eu-west-3",
        accountId: "123456789012",
        note: "AWS root key backup — emergency access only",
      },
      null,
      2,
    ),
  },
  {
    filename: "ssh_root_private_key.bak",
    type: "SSH_KEY",
    content: `-----BEGIN OPENSSH PRIVATE KEY-----\n# BACKUP ROOT SSH KEY — DO NOT USE IN PRODUCTION\n# This is a decoy file for intrusion detection\n-----END OPENSSH PRIVATE KEY-----\n`,
  },
  {
    filename: "discord_bot_token_master.bak",
    type: "CREDENTIALS",
    content: `# Discord Bot Master Token Backup\nDISCORD_BOT_TOKEN=backup_master_token_neon_$(date +%s)\nDISCORD_APP_ID=backup_app_id\nDISCORD_CLIENT_SECRET=backup_client_secret_neon\n`,
  },
];

// ─── Generation ──────────────────────────────────────────────────────────────

const CONFIG_DIR = join(process.cwd(), "src", "config");

/**
 * Generate all honeytoken bait files in src/config/.
 * Returns the list of created files with their hashes for FIM monitoring.
 */
export function generateHoneytokens(): Honeytoken[] {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const created: Honeytoken[] = [];

  for (const bait of BAIT_FILES) {
    const fullPath = join(CONFIG_DIR, bait.filename);

    // Don't overwrite if already exists (FIM might have already flagged it)
    if (!existsSync(fullPath)) {
      writeFileSync(fullPath, bait.content, { mode: 0o600 });
      const hash = createHash("sha256").update(bait.content).digest("hex");

      const token: Honeytoken = {
        path: fullPath,
        type: bait.type,
        hash,
        createdAt: Date.now(),
      };

      honeytokenRegistry.set(fullPath, token);
      created.push(token);

      logger.info(
        `${PURPLE}${BOLD}[HONEYTOKEN]${RESET} ${CYAN}Bait file deployed: ${bait.filename} (${bait.type})${RESET}`,
      );
    }
  }

  if (created.length > 0) {
    logger.info(
      `${PURPLE}${BOLD}[HONEYTOKEN]${RESET} ${CYAN}${created.length} honeytoken files deployed in src/config/${RESET}`,
    );
  }

  return created;
}

// ─── FIM Tripwire Check ──────────────────────────────────────────────────────

/**
 * Check if a Wazuh FIM alert targets a honeytoken file.
 * If so, returns true — the caller should bypass level checks and
 * instantly route to Layer 4 SOAR Validation Gate.
 */
export function isHoneytokenHit(filePath: string): boolean {
  if (!filePath) return false;

  // Normalize path for comparison
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  for (const [tokenPath] of honeytokenRegistry) {
    const tokenNormalized = tokenPath.replace(/\\/g, "/").toLowerCase();
    if (normalized.includes(tokenNormalized.split("/").pop() ?? "")) {
      logger.error(
        `${RED}${BOLD}[HONEYTOKEN TRIPWIRE]${RESET} ${RED}HONEYTOKEN ACCESSED: ${filePath}${RESET}\n` +
          `${RED}→ BYPASSING level checks — routing directly to SOAR Validation Gate${RESET}`,
      );
      return true;
    }
  }

  // Also check against known filenames even if registry is empty
  const knownBaitNames = BAIT_FILES.map((b) => b.filename.toLowerCase());
  const fileName = normalized.split("/").pop() ?? "";
  if (knownBaitNames.some((name) => fileName === name)) {
    logger.error(
      `${RED}${BOLD}[HONEYTOKEN TRIPWIRE]${RESET} ${RED}Honeytoken file accessed: ${filePath}${RESET}`,
    );
    return true;
  }

  return false;
}

/**
 * Get all registered honeytoken paths for external monitoring.
 */
export function getHoneytokenPaths(): string[] {
  return Array.from(honeytokenRegistry.keys());
}

/**
 * Get honeytoken metadata for a hit path.
 */
export function getHoneytokenInfo(filePath: string): Honeytoken | null {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  for (const [tokenPath, token] of honeytokenRegistry) {
    if (normalized.includes(tokenPath.split("/").pop() ?? "")) {
      return token;
    }
  }
  return null;
}
