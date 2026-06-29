/**
 * aiHotPatcher.ts — AI Hot-Patching System
 *
 * Permet à l'IA de proposer, générer et appliquer des correctifs à chaud
 * sur le bot sans redémarrage complet. Utilise le système de hot-reload
 * existant (hot-reload.ts) pour invalider le cache des modules et recharger
 * les commandes/services modifiés.
 *
 * Flow :
 *  1. detectIssue(errorLog) — l'IA détecte un problème dans les logs
 *  2. generatePatch(issue) — l'IA génère un correctif (diff ou nouveau code)
 *  3. validatePatch(patch) — validation syntaxique + analyse de sécurité
 *  4. applyPatch(patch) — application du correctif + hot-reload du module
 *  5. verifyPatch(patch) — vérification post-application (tests rapides)
 *  6. rollbackPatch(patch) — rollback si le patch cause une régression
 *
 * Sécurité :
 *  - Tous les patches doivent être validés par un admin via confirm.ts
 *  - Backup automatique avant chaque patch
 *  - Rollback automatique si les tests post-patch échouent
 */

import { Client, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { readFile, writeFile, mkdir, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";
import { createLog } from "./logs.js";
import { reloadModule, fullReload } from "../utils/hot-reload.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PatchType = "FIX" | "OPTIMIZATION" | "SECURITY" | "FEATURE" | "HOTFIX";
export type PatchStatus =
  | "PROPOSED"
  | "VALIDATED"
  | "APPLIED"
  | "VERIFIED"
  | "ROLLED_BACK"
  | "REJECTED";

export interface PatchIssue {
  id: string;
  source: string;
  errorLog: string;
  description: string;
  affectedFile: string;
  detectedAt: Date;
}

export interface Patch {
  id: string;
  issueId: string;
  type: PatchType;
  description: string;
  targetFile: string;
  originalContent: string;
  patchedContent: string;
  diff: string;
  status: PatchStatus;
  createdAt: Date;
  appliedAt: Date | null;
  verifiedAt: Date | null;
  rolledBackAt: Date | null;
  backupPath: string | null;
  riskLevel: "SAFE" | "MODERATE" | "RISKY";
}

export interface PatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── State ───────────────────────────────────────────────────────────────────

const patchStore = new Map<string, Patch>();
const BACKUP_DIR = join(process.cwd(), ".patch-backups");
const MAX_PATCHES = 50;

// ─── Détection d'issues ──────────────────────────────────────────────────────

/**
 * Analyse un log d'erreur et identifie le fichier affecté.
 */
export function detectIssue(errorLog: string, source: string): PatchIssue {
  let affectedFile = "unknown";

  // Extraire le fichier depuis le stack trace
  const fileMatch = errorLog.match(/at .+\((.+\.ts):(\d+):(\d+)\)/);
  if (fileMatch) {
    affectedFile = fileMatch[1];
  }

  // Fallback : chercher des noms de modules dans le log
  if (affectedFile === "unknown") {
    const moduleMatch = errorLog.match(/(?:from |require\(|import )['"]\.\/(.+)['"]/);
    if (moduleMatch) {
      affectedFile = `src/${moduleMatch[1]}.ts`;
    }
  }

  const issue: PatchIssue = {
    id: `issue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source,
    errorLog: errorLog.slice(0, 1000),
    description: summarizeError(errorLog),
    affectedFile,
    detectedAt: new Date(),
  };

  logger.info(`[HotPatcher] Issue détectée: ${issue.description} (${issue.affectedFile})`);
  return issue;
}

function summarizeError(errorLog: string): string {
  const firstLine = errorLog.split("\n")[0]?.trim() ?? errorLog.slice(0, 100);
  return firstLine.slice(0, 200);
}

// ─── Génération de patch ─────────────────────────────────────────────────────

/**
 * Génère un patch pour une issue détectée.
 * Dans une implémentation complète, l'IA analyserait le code et proposerait un correctif.
 * Ici, on prépare la structure et l'admin peut éditer le patch manuellement.
 */
export async function generatePatch(
  issue: PatchIssue,
  type: PatchType,
  description: string,
  patchedContent: string,
  riskLevel: Patch["riskLevel"] = "MODERATE",
): Promise<Patch> {
  let originalContent = "";

  try {
    const filePath = resolveFilePath(issue.affectedFile);
    if (existsSync(filePath)) {
      originalContent = await readFile(filePath, "utf8");
    }
  } catch (error) {
    logger.warn(
      `[HotPatcher] Impossible de lire le fichier original: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const diff = generateDiff(originalContent, patchedContent);

  const patch: Patch = {
    id: `patch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    issueId: issue.id,
    type,
    description,
    targetFile: issue.affectedFile,
    originalContent,
    patchedContent,
    diff,
    status: "PROPOSED",
    createdAt: new Date(),
    appliedAt: null,
    verifiedAt: null,
    rolledBackAt: null,
    backupPath: null,
    riskLevel,
  };

  patchStore.set(patch.id, patch);
  if (patchStore.size > MAX_PATCHES) {
    const oldest = patchStore.keys().next().value;
    if (oldest) patchStore.delete(oldest);
  }

  logger.info(`[HotPatcher] Patch généré: ${patch.id} pour ${issue.affectedFile}`);
  return patch;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Valide un patch avant application.
 */
export function validatePatch(patch: Patch): PatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Vérifier que le contenu patché n'est pas vide
  if (!patch.patchedContent.trim()) {
    errors.push("Le contenu patché est vide");
  }

  // Vérifier la taille (éviter les patches massifs)
  if (patch.patchedContent.length > 100_000) {
    warnings.push("Patch volumineux (>100KB) — vérifier la portée");
  }

  // Vérifier qu'il n'y a pas de code dangereux
  const dangerousPatterns = [
    /eval\s*\(/,
    /child_process/,
    /require\s*\(\s*['"]child_process/,
    /exec\s*\(/,
    /spawn\s*\(/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(patch.patchedContent) && !pattern.test(patch.originalContent)) {
      errors.push(`Pattern dangereux détecté: ${pattern.source}`);
    }
  }

  // Vérifier que le fichier cible existe
  const filePath = resolveFilePath(patch.targetFile);
  if (!existsSync(filePath)) {
    warnings.push(`Le fichier cible n'existe pas: ${patch.targetFile}`);
  }

  // Vérifier la syntaxe TypeScript basique (imports au top level)
  const importLines = patch.patchedContent.match(/^import\s+.+/gm) ?? [];
  const nonImportLines = patch.patchedContent
    .split("\n")
    .filter((l) => !l.trim().startsWith("import") && !l.trim().startsWith("//") && l.trim());
  if (importLines.length > 0 && nonImportLines.length > 0) {
    const firstNonImport = patch.patchedContent.indexOf(nonImportLines[0]);
    const lastImport = patch.patchedContent.lastIndexOf("import ");
    if (firstNonImport < lastImport) {
      warnings.push("Imports détectés hors du top-level — vérifier le style");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Application ─────────────────────────────────────────────────────────────

/**
 * Applique un patch : backup → écriture → hot-reload.
 */
export async function applyPatch(client: Client, patchId: string): Promise<Patch | null> {
  const patch = patchStore.get(patchId);
  if (!patch || (patch.status !== "PROPOSED" && patch.status !== "VALIDATED")) return null;

  const filePath = resolveFilePath(patch.targetFile);

  try {
    // 1. Backup
    await mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = join(BACKUP_DIR, `${basename(patch.targetFile)}.${patch.id}.bak`);
    if (existsSync(filePath)) {
      await copyFile(filePath, backupPath);
    }
    patch.backupPath = backupPath;

    // 2. Écriture du fichier patché
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, patch.patchedContent, "utf8");

    patch.status = "APPLIED";
    patch.appliedAt = new Date();

    logger.info(`[HotPatcher] Patch ${patchId} appliqué à ${patch.targetFile}`);

    // 3. Hot-reload du module
    try {
      await reloadModule(filePath);
      logger.info(`[HotPatcher] Module ${patch.targetFile} rechargé avec succès`);
    } catch (reloadError) {
      logger.warn(
        `[HotPatcher] Hot-reload échoué, tentative fullReload: ${reloadError instanceof Error ? reloadError.message : String(reloadError)}`,
      );
      try {
        await fullReload(client);
      } catch {
        // Non-critique — le fichier est écrit, le reload se fera au prochain cycle
      }
    }

    // 4. Log
    try {
      await createLog({
        type: "HOT_PATCH",
        action: `Patch appliqué: ${patch.description}`,
        details: JSON.stringify({
          patchId: patch.id,
          targetFile: patch.targetFile,
          type: patch.type,
          riskLevel: patch.riskLevel,
        }),
      });
    } catch {
      // Non-critique
    }

    return patch;
  } catch (error) {
    logger.error(
      `[HotPatcher] Erreur application patch ${patchId}: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Tentative de rollback automatique
    if (patch.backupPath && existsSync(patch.backupPath)) {
      try {
        await copyFile(patch.backupPath, filePath);
        logger.info(`[HotPatcher] Rollback automatique effectué pour ${patchId}`);
      } catch {
        // Non-critique
      }
    }

    return null;
  }
}

// ─── Vérification post-patch ─────────────────────────────────────────────────

/**
 * Marque un patch comme vérifié (tests post-patch réussis).
 */
export function verifyPatch(patchId: string): Patch | null {
  const patch = patchStore.get(patchId);
  if (!patch || patch.status !== "APPLIED") return null;

  patch.status = "VERIFIED";
  patch.verifiedAt = new Date();

  logger.info(`[HotPatcher] Patch ${patchId} vérifié avec succès`);
  return patch;
}

// ─── Rollback ────────────────────────────────────────────────────────────────

/**
 * Annule un patch et restaure la version originale.
 */
export async function rollbackPatch(client: Client, patchId: string): Promise<Patch | null> {
  const patch = patchStore.get(patchId);
  if (!patch || !patch.backupPath) return null;

  const filePath = resolveFilePath(patch.targetFile);

  try {
    if (existsSync(patch.backupPath)) {
      await copyFile(patch.backupPath, filePath);
      patch.status = "ROLLED_BACK";
      patch.rolledBackAt = new Date();

      logger.info(`[HotPatcher] Patch ${patchId} annulé — fichier restauré`);

      // Hot-reload après rollback
      try {
        await reloadModule(filePath);
      } catch {
        try {
          await fullReload(client);
        } catch {
          // Non-critique
        }
      }

      try {
        await createLog({
          type: "HOT_PATCH_ROLLBACK",
          action: `Patch annulé: ${patch.description}`,
          details: JSON.stringify({ patchId: patch.id, targetFile: patch.targetFile }),
        });
      } catch {
        // Non-critique
      }
    }

    return patch;
  } catch (error) {
    logger.error(
      `[HotPatcher] Erreur rollback ${patchId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveFilePath(targetFile: string): string {
  if (targetFile.startsWith("src/")) {
    return join(process.cwd(), targetFile);
  }
  if (targetFile.startsWith("/") || targetFile.match(/^[A-Z]:/)) {
    return targetFile;
  }
  return join(process.cwd(), "src", targetFile);
}

function generateDiff(original: string, patched: string): string {
  const origLines = original.split("\n");
  const patchedLines = patched.split("\n");
  const maxLen = Math.max(origLines.length, patchedLines.length);

  const diffLines: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const orig = origLines[i] ?? "";
    const patched = patchedLines[i] ?? "";

    if (orig === patched) {
      diffLines.push(`  ${orig}`);
    } else {
      if (orig) diffLines.push(`- ${orig}`);
      if (patched) diffLines.push(`+ ${patched}`);
    }
  }

  return diffLines.join("\n");
}

// ─── API publique ────────────────────────────────────────────────────────────

export function getPatch(patchId: string): Patch | null {
  return patchStore.get(patchId) ?? null;
}

export function getAllPatches(): Patch[] {
  return Array.from(patchStore.values());
}

export function getPatchesByStatus(status: PatchStatus): Patch[] {
  return Array.from(patchStore.values()).filter((p) => p.status === status);
}

export function clearPatchStore(): void {
  patchStore.clear();
}

export function buildPatchEmbed(patch: Patch): EmbedBuilder {
  const statusColors: Record<PatchStatus, number> = {
    PROPOSED: 0xffaa00,
    VALIDATED: 0x3498db,
    APPLIED: 0x57f287,
    VERIFIED: 0x00ff00,
    ROLLED_BACK: 0xff6600,
    REJECTED: 0xff3344,
  };

  return new EmbedBuilder()
    .setTitle(`🔧 AI Hot-Patch — ${patch.id}`)
    .setColor(statusColors[patch.status] ?? 0x808080)
    .setDescription(patch.description)
    .addFields(
      { name: "Type", value: patch.type, inline: true },
      { name: "Statut", value: patch.status, inline: true },
      { name: "Risque", value: patch.riskLevel, inline: true },
      { name: "Fichier cible", value: `\`${patch.targetFile}\``, inline: false },
      {
        name: "Créé",
        value: `<t:${Math.floor(patch.createdAt.getTime() / 1000)}:R>`,
        inline: true,
      },
    )
    .setFooter({ text: `AI Hot-Patching System` })
    .setTimestamp();
}
