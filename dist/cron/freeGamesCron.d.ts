/**
 * freeGamesCron.ts — Cron Jeux Gratuits
 *
 * Pipeline complet : scraper-bridge → ScraperManager → translator → ChannelRouter
 *
 * Surveille r/FreeGameFindings (Reddit RSS) et l'API Epic Games pour
 * détecter les nouveaux jeux gratuits, les traduire en français,
 * et les router vers le(s) salon(s) Discord approprié(s).
 *
 * Fonctionne toutes les 10 minutes avec barrière 48h et déduplication Prisma.
 */
import { Client } from "discord.js";
declare function checkFreeGames(client: Client): Promise<void>;
export declare function startFreeGamesMonitoring(client: Client): void;
export declare function stopFreeGamesMonitoring(): void;
export { checkFreeGames };
//# sourceMappingURL=freeGamesCron.d.ts.map