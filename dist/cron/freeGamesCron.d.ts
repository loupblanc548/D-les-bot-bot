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
declare function checkFreeGames(client: Client): Promise<void>;
export declare function startFreeGamesMonitoring(client: Client): void;
export declare function stopFreeGamesMonitoring(): void;
export { checkFreeGames };
//# sourceMappingURL=freeGamesCron.d.ts.map