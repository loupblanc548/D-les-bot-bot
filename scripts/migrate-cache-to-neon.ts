/**
 * migrate-cache-to-neon.ts — Script one-shot de migration
 *
 * Lit l'ancien fichier notification_cache.json et injecte
 * toutes les donnees dans la table ProcessedCache de Neon.
 *
 * Usage: npx tsx scripts/migrate-cache-to-neon.ts
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const CACHE_FILE = path.join(process.cwd(), "notification_cache.json");

interface CacheData {
  [platform: string]: string[] | string | undefined;
  _lastMaintenance?: string;
}

async function main(): Promise<void> {
  console.log("=== Migration notification_cache.json → Neon ===\n");

  // 1. Verifier si le fichier existe
  if (!fs.existsSync(CACHE_FILE)) {
    console.log("ℹ️  Aucun fichier notification_cache.json trouve — rien a migrer.");
    process.exit(0);
  }

  // 2. Lire le fichier
  let data: CacheData;
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    data = JSON.parse(raw);
    console.log(`✓ Fichier lu: ${Object.keys(data).length} cles trouvees`);
  } catch (error) {
    console.error("❌ Erreur lecture du fichier:", error);
    process.exit(1);
  }

  // 3. Migrer chaque plateforme
  const platforms = Object.keys(data).filter(
    (k) => k !== "_lastMaintenance" && Array.isArray(data[k])
  );

  let totalMigrated = 0;
  const stats: Record<string, number> = {};

  for (const platform of platforms) {
    const ids = data[platform] as string[];
    if (ids.length === 0) {
      stats[platform] = 0;
      continue;
    }

    try {
      const result = await prisma.processedCache.createMany({
        data: ids.map((uniqueId) => ({ platform, uniqueId })),
        skipDuplicates: true,
      });
      stats[platform] = result.count;
      totalMigrated += result.count;
      console.log(`  ✓ ${platform}: ${result.count} IDs migres (${ids.length - result.count} doublons ignores)`);
    } catch (error: any) {
      console.error(`  ❌ ${platform}: erreur — ${error?.message || String(error)}`);
      stats[platform] = 0;
    }
  }

  // 4. Migrer _lastMaintenance si present
  if (data._lastMaintenance) {
    try {
      await prisma.appState.upsert({
        where: { key: "lastMaintenance" },
        create: { key: "lastMaintenance", value: data._lastMaintenance },
        update: { value: data._lastMaintenance },
      });
      console.log(`  ✓ _lastMaintenance migre: ${data._lastMaintenance}`);
    } catch (error: any) {
      console.error(`  ❌ _lastMaintenance: erreur — ${error?.message || String(error)}`);
    }
  }

  // 5. Resume
  console.log("\n=== Resume ===");
  console.log(`Total IDs migres: ${totalMigrated}`);
  for (const [platform, count] of Object.entries(stats)) {
    console.log(`  ${platform}: ${count}`);
  }

  await prisma.$disconnect();
  console.log("\n✅ Migration terminee !");
}

main().catch((error) => {
  console.error("❌ Erreur fatale:", error);
  process.exit(1);
});
