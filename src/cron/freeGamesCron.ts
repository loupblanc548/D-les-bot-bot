/**
 * freeGamesCron.ts — Cron Jeux Gratuits
 *
 * Pipeline : FreeGameFetcher (Strategy Pattern) → translator → ChannelRouter
 * → translator → ChannelRouter
 *
 * Surveille r/FreeGameFindings (Reddit RSS) et l'API Epic Games pour
 * detecter les nouveaux jeux gratuits, les traduire en francais,
 * et les router vers le(s) salon(s) Discord approprie(s).
 *
 * Fonctionne toutes les 10 minutes avec barriere 48h et deduplication Prisma.
 */

import { Client } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import { config } from "../config";
import logger from "../utils/logger";
import { translateAutoToFrench } from "../utils/translator";
import {
  ContentType,
  isNewItem,
  markAsProcessed,
  isWithinTemporalBarrier,
} from "../managers/ScraperManager";
import { FreeGameFetcher, FreeGameItem } from "../services/FreeGameFetcher";
import { routeArticle } from "../managers/ChannelRouter";
import { dedupCache } from "../utils/deduplicationCache";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Genere un resume propre a partir du contenu HTML/texte.
 */
function generateSummary(content: string): string {
  if (!content) return "Aucune description disponible";

  let cleanText = content.replace(/<[^>]*>/g, "");
  cleanText = cleanText.replace(new RegExp("\[?/[a-z]+\]", "gi"), "");
  cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, "");
  cleanText = cleanText.replace(/\s+/g, " ").trim();

  if (cleanText.length > 500) {
    cleanText = cleanText.substring(0, 500);
    const lastSpace = cleanText.lastIndexOf(" ");
    if (lastSpace > 400) {
      cleanText = cleanText.substring(0, lastSpace);
    }
    cleanText += "...";
  }

  return cleanText;
}

// ─── Pipeline de traitement (individuel) ───────────────────────────────────────

/**
 * Pipeline complet pour un jeu gratuit :
 * 1. Barriere temporelle 48h (isWithinTemporalBarrier)
 * 2. Traduction (translator)
 * 3. Routage multi-salon (ChannelRouter)
 * 4. Marquage comme traite (ScraperManager)
 */
async function processFreeGame(client: Client, item: FreeGameItem): Promise<void> {
  const gameId = item.redditPostId || item.guid || item.link;

  // Etape 1: Barriere temporelle 48h (ScraperManager)
  if (!isWithinTemporalBarrier(item.pubDate)) {
    logger.debug(`[FreeGamesCron] Item ignore (barriere 24h): ${item.pubDate}`);
    return;
  }

  // Etape 1b: Deduplication (ScraperManager)
  const isNew = await isNewItem(ContentType.FREE_GAME, gameId);
  if (!isNew) {
    return;
  }

  // VERROU ANTI-SPAM : dedup cache JSON local
  if (dedupCache.isAlreadyProcessed("free_games", gameId)) {
    logger.debug(`[SPAM BLOQUE] FreeGames doublon cache: ${gameId}`);
    return;
  }

  // Etape 2: Traduction (translator)
  let translatedTitle = item.title;
  let translatedContent = generateSummary(item.content || item.contentSnippet || "");

  try {
    const titleResult = await translateAutoToFrench(item.title);
    if (titleResult && titleResult.detectedLanguage !== "fr") {
      translatedTitle = titleResult.translatedText;
    }

    const contentResult = await translateAutoToFrench(translatedContent);
    if (contentResult && contentResult.detectedLanguage !== "fr") {
      translatedContent = contentResult.translatedText;
    }
  } catch (error) {
    logger.debug(`[FreeGamesCron] Erreur traduction, utilisation texte original: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (translatedContent.length > 1800) {
    translatedContent = translatedContent.slice(0, 1797) + "...";
  }

  // Etape 3: Routage multi-salon (ChannelRouter)
  const imageUrl = item.thumbnail || item.enclosure?.url;

  try {
    const routingResult = await routeArticle(
      client,
      translatedTitle,
      translatedContent,
      item.link,
      item.pubDate,
      imageUrl,
    );

    logger.info(
      `[FreeGamesCron] Route: "${translatedTitle.slice(0, 60)}" -> ${routingResult.sentTo.length} salon(s), ${routingResult.errors.length} erreur(s)`
    );

    if (routingResult.errors.length > 0) {
      logger.warn(
        `[FreeGamesCron] Erreurs routage: ${routingResult.errors.join("; ")}`
      );
    }

    // Etape 4: Marquage — seulement si route
    if (routingResult.routed) {
      // Marquer dans le cache JSON anti-doublon
      await dedupCache.markAsProcessed("free_games", gameId);
      await markAsProcessed(ContentType.FREE_GAME, gameId);
    }
  } catch (error) {
    logger.error(
      `[FreeGamesCron] Echec routage: ${error instanceof Error ? error.message : String(error)}`,
      { stack: error instanceof Error ? error.stack : undefined }
    );
  }
}

// ─── Fetch & Orchestration ─────────────────────────────────────────────────────

async function checkFreeGames(client: Client): Promise<void> {
  // 🔒 Recharge le cache anti-doublon depuis le disque (persistance inter-cycles)
  await dedupCache.reloadFromDisk();
  logger.info("[FreeGamesCron] Verification des jeux gratuits...");

  try {
    // Utilisation du FreeGameFetcher (Strategy Pattern) pour la recuperation
    const fetcher = new FreeGameFetcher();
    const items = await fetcher.fetchGames();

    if (items.length === 0) {
      logger.warn("[FreeGamesCron] Aucun jeu gratuit trouve");
      return;
    }

    // Traitement sequentiel avec delai anti rate-limit (1s entre chaque item)
    let processedCount = 0;
    let failedCount = 0;
    for (const item of items.slice(0, 10)) {
      try {
        await processFreeGame(client, item);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        processedCount++;
      } catch (err) {
        failedCount++;
        logger.error(`[FreeGamesCron] Erreur traitement jeu: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logger.info(`[FreeGamesCron] ${processedCount} traite(s), ${failedCount} echec(s)`);
  } catch (error) {
    logger.error(`[FreeGamesCron] Erreur critique: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─── Cron Management ───────────────────────────────────────────────────────────

let cronJob: ScheduledTask | null = null;
let isChecking = false;

export function startFreeGamesMonitoring(client: Client): void {
  if (cronJob) {
    logger.warn("[FreeGamesCron] Deja actif — ignore");
    return;
  }

  logger.info("[FreeGamesCron] Surveillance des jeux gratuits — toutes les 10 minutes");

  cronJob = cron.schedule("*/10 * * * *", () => {
    if (isChecking) {
      logger.info("[FreeGamesCron] Verification deja en cours, ignoree");
      return;
    }

    isChecking = true;
    logger.info("[FreeGamesCron] Verification des jeux gratuits");

    checkFreeGames(client)
      .catch((err) => logger.error(`[FreeGamesCron] Erreur cron: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        isChecking = false;
      });
  });
}

export function stopFreeGamesMonitoring(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[FreeGamesCron] Arrete");
  }
}

export { checkFreeGames };
