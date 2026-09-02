/**
 * learnStatsCollector.ts — Collecte partagée des stats vault / self-learner.
 */

import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { getSelfLearnerStatus } from "./selfLearner.js";
import { getSelfLearnerMetrics } from "./selfLearnerMetrics.js";

export interface LearnStatsData {
  totalQA: number;
  dedupCount: number;
  vaultSizeBytes: number;
  categories: [string, number][];
  recentSubjects: { name: string; time: string }[];
  status: ReturnType<typeof getSelfLearnerStatus>;
  metrics: ReturnType<typeof getSelfLearnerMetrics>;
  cadence: { batchSize: number; intervalSeconds: number; estimatedPerDay: number };
  timestamp: string;
}

function resolveVaultPath(): string | null {
  return config.obsidianVaultPath || process.env.OBSIDIAN_VAULT_PATH || null;
}

function dirSizeBytes(dirPath: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += dirSizeBytes(full);
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {
          // skip
        }
      }
    }
  } catch {
    // ignore
  }
  return total;
}

export function collectLearnStats(): LearnStatsData {
  const vaultPath = resolveVaultPath();
  const categories: Record<string, number> = {};
  let totalQA = 0;
  let dedupCount = 0;
  let vaultSizeBytes = 0;
  const recentSubjects: { name: string; mtime: number }[] = [];

  if (vaultPath) {
    const qaDir = path.join(vaultPath, "qa");
    if (fs.existsSync(qaDir)) {
      vaultSizeBytes = dirSizeBytes(qaDir);

      for (const dir of fs.readdirSync(qaDir, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        const dirPath = path.join(qaDir, dir.name);
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));
        categories[dir.name] = files.length;
        totalQA += files.length;

        if (totalQA < 2000) {
          for (const file of files) {
            try {
              const stat = fs.statSync(path.join(dirPath, file));
              recentSubjects.push({
                name: `${dir.name}/${file.replace(/\.md$/, "")}`,
                mtime: stat.mtimeMs,
              });
            } catch {
              // skip
            }
          }
        }
      }

      const dedupFile = path.join(qaDir, ".learned-subjects.json");
      if (fs.existsSync(dedupFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(dedupFile, "utf-8"));
          dedupCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
        } catch {
          // ignore
        }
      }
    }
  }

  recentSubjects.sort((a, b) => b.mtime - a.mtime);
  const status = getSelfLearnerStatus();
  const intervalSeconds = status.intervalMs / 1000;
  const estimatedPerDay = Math.round((86400 / intervalSeconds) * status.batchSize);

  return {
    totalQA,
    dedupCount,
    vaultSizeBytes,
    categories: Object.entries(categories).sort((a, b) => b[1] - a[1]),
    recentSubjects: recentSubjects.slice(0, 10).map((s) => ({
      name: s.name,
      time: new Date(s.mtime).toISOString(),
    })),
    status,
    metrics: getSelfLearnerMetrics(),
    cadence: {
      batchSize: status.batchSize,
      intervalSeconds,
      estimatedPerDay,
    },
    timestamp: new Date().toISOString(),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
