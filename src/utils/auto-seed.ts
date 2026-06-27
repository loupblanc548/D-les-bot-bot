/**
 * auto-seed.ts
 *
 * Auto-insère les sources YouTube et Twitter depuis le .env dans la DB
 * au démarrage du bot. Utilise upsert pour éviter les doublons.
 */

import prisma from "../prisma.js";
import { config } from "../config.js";
import logger from "./logger.js";

export async function autoSeedSources(): Promise<void> {
  const guildId = config.guildId || "global";
  let inserted = 0;

  // ── YouTube ──────────────────────────────────────────────────────
  for (const route of config.youtubePlatformRouting) {
    for (const handle of route.channels) {
      const cleanHandle = handle.trim();
      if (!cleanHandle) continue;
      try {
        await prisma.source.upsert({
          where: {
            urlOrHandle_type_channelId: {
              urlOrHandle: cleanHandle,
              type: "YOUTUBE",
              channelId: route.channelId,
            },
          },
          update: {},
          create: {
            guildId,
            type: "YOUTUBE",
            urlOrHandle: cleanHandle,
            channelId: route.channelId,
            lastProcessedId: null,
          },
        });
        inserted++;
      } catch {
        // Ignore duplicates
      }
    }
  }

  // ── Twitter (comptes spécifiques par plateforme) ─────────────────
  for (const route of config.twitterPlatformRouting) {
    for (const account of route.accounts) {
      const cleanAccount = account.trim();
      if (!cleanAccount) continue;
      try {
        await prisma.source.upsert({
          where: {
            urlOrHandle_type_channelId: {
              urlOrHandle: cleanAccount,
              type: "TWITTER",
              channelId: route.channelId,
            },
          },
          update: {},
          create: {
            guildId,
            type: "TWITTER",
            urlOrHandle: cleanAccount,
            channelId: route.channelId,
            lastProcessedId: null,
          },
        });
        inserted++;
      } catch {
        // Ignore duplicates
      }
    }
  }

  if (inserted > 0) {
    logger.info(`[AutoSeed] ${inserted} source(s) insérée(s) depuis le .env`);
  }
}
