/**
 * knowledgeCrons.ts — Scheduled cron jobs for 5 GitHub knowledge syncers
 */
import { schedule, ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import {
  syncPublicApis,
  syncCodeSnippets,
  syncFreeBooks,
  syncSystemDesign,
  syncAwesomeLists,
} from "../services/knowledgeIngestion.js";

const crons: ScheduledTask[] = [];

export function startKnowledgeCrons(): void {
  if (crons.length > 0) {
    logger.warn("[KnowledgeCrons] Already running — ignored");
    return;
  }

  // A. Public APIs — monthly, 1st at 02:00
  crons.push(
    schedule("0 2 1 * *", () => {
      void syncPublicApis().catch((e) =>
        logger.error(`[PUBLIC_APIS] Cron: ${e instanceof Error ? e.message : String(e)}`),
      );
    }),
  );

  // B. Code snippets — bi-weekly (1st and 15th at 03:00)
  crons.push(
    schedule("0 3 1,15 * *", () => {
      void syncCodeSnippets().catch((e) =>
        logger.error(`[CODE_SNIPPETS] Cron: ${e instanceof Error ? e.message : String(e)}`),
      );
    }),
  );

  // C. Free books — monthly, 1st at 04:00
  crons.push(
    schedule("0 4 1 * *", () => {
      void syncFreeBooks().catch((e) =>
        logger.error(`[FREE_BOOKS] Cron: ${e instanceof Error ? e.message : String(e)}`),
      );
    }),
  );

  // D. System design — monthly, 1st at 05:00
  crons.push(
    schedule("0 5 1 * *", () => {
      void syncSystemDesign().catch((e) =>
        logger.error(`[SYSTEM_DESIGN] Cron: ${e instanceof Error ? e.message : String(e)}`),
      );
    }),
  );

  // E. Awesome lists — monthly, 1st at 06:00
  crons.push(
    schedule("0 6 1 * *", () => {
      void syncAwesomeLists().catch((e) =>
        logger.error(`[AWESOME_LISTS] Cron: ${e instanceof Error ? e.message : String(e)}`),
      );
    }),
  );

  // Initial sync after 60s on startup (staggered)
  setTimeout(() => void syncPublicApis().catch(() => {}), 60_000);
  setTimeout(() => void syncCodeSnippets().catch(() => {}), 90_000);
  setTimeout(() => void syncFreeBooks().catch(() => {}), 120_000);
  setTimeout(() => void syncSystemDesign().catch(() => {}), 150_000);
  setTimeout(() => void syncAwesomeLists().catch(() => {}), 180_000);

  for (const c of crons) if (c.unref) c.unref();
  logger.info("[KnowledgeCrons] 5 knowledge sync crons started (monthly/bi-weekly)");
}

export function stopKnowledgeCrons(): void {
  for (const c of crons) c.stop();
  crons.length = 0;
  logger.info("[KnowledgeCrons] Stopped");
}
