/**
 * index.ts — Point d'entrée du bot Discord
 *
 * Ce fichier est volontairement minimal : il délègue toute la logique
 * à des modules spécialisés pour réduire la complexité.
 *
 * Modules extraits :
 *   - bot.ts        : Orchestrateur (main, client, connexions)
 *   - commandRouter.ts : Routeur de commandes
 *   - interactionHandler.ts : Gestionnaires d'interactions
 *   - startup.ts    : Logique de démarrage (ClientReady)
 *   - shutdown.ts   : Arrêt gracieux (SIGINT/SIGTERM)
 *   - processHandlers.ts : Gestionnaires d'erreurs process
 */
import { main } from "./bot.js";
main();
//# sourceMappingURL=index.js.map